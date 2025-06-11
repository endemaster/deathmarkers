#pragma once

#include <Geode/Geode.hpp>
#include <Geode/utils/web.hpp>
#include <stdlib.h>
#include <thread>
#include "shared.hpp"

#define translate( X ) static_cast<int>(X / 30)

int const MAX_RETRIES = 4;
auto const RETRY_TIMEOUT = std::chrono::seconds(5);

class Submitter {
private:  
	int retries = 0;
  web::WebRequest request;
  EventListener<web::WebTask> listener;

	void event(web::WebTask::Event* e);

public:
  Submitter(web::WebRequest request);
	~Submitter();
  void submit();
};

namespace dm {
  void purgeSpam(vector<DeathLocationOut>& deaths);
}