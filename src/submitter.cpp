#include "submitter.hpp"


Submitter::Submitter(web::WebRequest request) {
	request.timeout(dm::HTTP_TIMEOUT);
  this->request = request;

	this->listener.bind(
		[this](web::WebTask::Event* e) {
			this->event(e);
		}
	);
}

Submitter::~Submitter() {}

void Submitter::event(web::WebTask::Event* e) {
	auto res = e->getValue();
	if (res) {
		if (!res->ok()) {
			int code = res->code();
			auto body = res->string().unwrapOr("Unknown");

			log::error("Posting Deaths failed: {} {}", code, body);

			if (code >= 400 && code < 500) {
				log::debug("Dropping submission due to 4xx error response.");
			}

			if (code >= 500 && code < 600 || code < 0) { // whatever 6xx responses mean
				log::debug("Waiting to retry...");
				std::thread([this]() {
					std::this_thread::sleep_for(RETRY_TIMEOUT);
					this->submit();
				}).detach();
				return;
			}
		} else log::debug("Posted Deaths.");
		// what can i say except
		delete this;
	}
	else if (e->isCancelled()) {
		log::error("Posting Death was cancelled. I DONT KNOW WHAT HAPPENED IM JUST GONNA DO NOTHING AND PRAY");
		// idk when this happens, at least sometimes when the listener gets destroyed?
		// in that case we dont want to "delete this;" again.
	}
}

void Submitter::submit() {
	log::debug("Sending request... (Retry {})", this->retries);
	if (retries >= MAX_RETRIES) {
		log::warn("Hit maximum retry count. Dropping submission.");
		delete this;
		return;
	}
	retries++;
	this->listener.setFilter(this->request.get(dm::makeRequestURL("submit")));
}


void dm::purgeSpam(vector<DeathLocationOut>& deaths) {
	erase_if(deaths, [](DeathLocationOut& d){
		return d.percentage > 100;
	});

	uint32_t total = deaths.size();

	if (total < 20) return;
	log::debug("Spam Removal: 20 death threshold passed.");

	int percFrequency[101] = {0};
	for (auto i = deaths.begin(); i < deaths.end(); i++) {
		percFrequency[i->percentage]++;
	}

	uint32_t max = 0;
	for (int p = 0; p < 101; p++) {
		if (percFrequency[p] > max) max = percFrequency[p];
	}
	log::debug("Spam Removal: Maximum concentration {}", max);

	// In the minimum case (20 deaths total), 5+ deaths at the same % trigger spam removal
	// In a session of 100 deaths, 25+ at the same % -> spam removal
	if (max * 4 < total) return;
	log::debug("Spam Removal: 25% Threshold passed.");

	float percRelFrequency[101] = {0.0f};
	for (int p = 0; p < 101; p++) {
		percRelFrequency[p] = static_cast<float>(percFrequency[p]) / max;
	}

	log::debug("Spam Removal: Pre-purge {}", total);
	erase_if(deaths, [percRelFrequency](auto& d){
		return percRelFrequency[d.percentage] > .8;
	});
	log::debug("Spam Removal: Post-purge {}", deaths.size());
}
