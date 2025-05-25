if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
  No flags.
    `);
  process.exit(0);
}

const {
  PORT, DATABASE
} = require("./config.json");
const BUFFER_SIZE = 500; // # of deaths to push at once
const BINARY_VERSION = 1; // Incremental
const RATE_LIMIT_GRACE = 60 * 1000;
const alphabet = "ABCDEFGHIJOKLMNOPQRSTUVWXYZabcdefghijoklmnopqrstuvwxyz0123456789";
const random = l => new Array(l).fill(0)
  .map(_ => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");

const db = require("./database/" + DATABASE.SCRIPT);
const expr = require("express");
const app = expr();
const crypto = require("crypto");
const fs = require("fs");
const md = require("markdown-it")({ html: true, breaks: true })
  .use(require("@mdit-vue/plugin-frontmatter").frontmatterPlugin)
  .use(require('markdown-it-named-headings'));
const { Readable } = require("stream");

app.use(expr.static("front"));
app.set('trust proxy', 1);

const timedOut = {}
const banned = {}

// 60 second grace period for clients emptying the queue while the server was offline
let rateLimit = (_req, _res, next) => next();
setTimeout(_ => {
  console.log("Rate Limiter now active.")
  rateLimit = require("express-rate-limit").rateLimit({
    windowMs: 8 * 1000, // 8 seconds
    limit: 2,
    handler: (request, response, _, options) => {
      response.statusCode = 429;
      response.removeHeader("X-RetryAfter");
      response.end("Too many requests");
      if (Date.now() - timedOut[request.ip] < 2 * options.windowMs + 1000) {
        if (Date.now() - timedOut[request.ip] > options.windowMs + 1000) {
          banned[request.ip] = Date.now() + 60 * 60 * 1000; // 1 hour
          console.log(request.ip, "banned.");
        }
        return;
      }
      timedOut[request.ip] = Date.now();
    }
  });
}, RATE_LIMIT_GRACE);
let rateLimitDelegate = (req, res, next) => rateLimit(req, res, next);

const checkBan = (request, response, next) => {
  if (!(request.ip in banned)) return next();
  if (banned[request.ip] < Date.now()) {
    delete banned[request.ip];
    return next();
  }
  response.statusCode = 429;
  response.end("IP banned until " + banned[request.ip]);
}

const outline = fs.readFileSync("./outline.html", "utf8");
const guideHtml = {};
fs.readdirSync("./pages").forEach(fn => {
  guideHtml[fn.replace(".md", "")] = renderGuide(fn);
});
const robots = fs.readFileSync("./robots.txt", "utf8");
const excluded = fs.readFileSync("exclude", "utf8")
  .split("\n").map(x => x.trim())
  .filter(x => /\d+/.test(x))
  .map(x => parseInt(x));

function csvStream(array, columns, map = r => r) {
  return new Readable({
    read() {
      let buffer = [columns];
      for (const row of array) {
        buffer.push(map(row).join(","));

        if (buffer.length >= BUFFER_SIZE) {
          this.push(buffer.join("\n") + "\n");
          buffer = [];
        }
      }
      this.push(buffer.join("\n"));
      this.push(null);
    }
  })
}

function binaryStream(array, columns, map = r => r) {
  const int8Buffer = d => {
    const b = Buffer.alloc(1);
    b.writeUInt8(d);
    return b;
  }
  const int16Buffer = d => {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(d);
    return b;
  }
  const floatBuffer = d => {
    const b = Buffer.alloc(4);
    b.writeFloatLE(d);
    return b;
  }

  columns = columns.split(",").map(c => ({
    userident: d => Buffer.from(d, "hex"),
    levelversion: int8Buffer,
    practice: int8Buffer,
    x: floatBuffer,
    y: floatBuffer,
    percentage: int16Buffer
  })[c]);
  return new Readable({
    read() {
      let buffer = [int8Buffer(BINARY_VERSION)]; // Versioning Byte
      for (const row of array) {
        buffer.push(
          Buffer.concat(
            map(row).map((d, i) => columns[i](d))
          )
        );

        if (buffer.length >= BUFFER_SIZE) {
          this.push(Buffer.concat(buffer));
          buffer = [];
        }
      }
      this.push(Buffer.concat(buffer));
      this.push(null);
    }
  })
}

function renderGuide(fn) {
  console.log(`Rendering guide ${fn}...`);
  let markdown = fs.readFileSync(`./pages/${fn}`, "utf8");
  markdown = markdown.replace(/<!--.*?-->\n?/gs, ""); // Remove comments
  let chapters = markdown.split("\n")
    .filter(x => x.startsWith("##"))
    .map(x => x.slice(2).trimEnd().replace(" ", "")); // Identify headings

  // Index Chapters by heading depth and render nested <ol>s
  let levels = [0];
  let last = 0;
  chapters = chapters.map((x, i) => {
    let c = x.search(/[^#]/);
    x = x.slice(c);
    if (c > last) levels[c] = 0;
    if (c < last) levels.splice(c + 1, Infinity);
    if (!levels[c]) levels[c] = 0;
    last = c;
    return `${"\t".repeat(c)}${++levels[c]}. [${x}]` +
      `(#${x.toLowerCase().replaceAll(" ", "-")})`;
  });
  markdown = markdown.replace("<?>TOC",
    chapters.join("\n"));

  let env = {};
  let html = md.render(markdown, env);
  html = outline.replace("~~~", html);
  html = html.replace("<?>TITLE", env.frontmatter.title ?? "DeathMarkers Creator Guide");
  html = html.replace("<?>DESC", env.frontmatter.description ?? "");
  // markdown preview requires directory, running server hosts files on root
  html = html.replace(/src=".*?front\//g, "src=\"");
  // Replace newlines and whitespace between HTML tags
  html = html.replace(/>\s+</g, "><");
  return html;
}

function createUserIdent(userid, username, levelid) {
  let source = `${username}_${userid}_${levelid}`;

  return crypto.createHash("sha1").update(source).digest("hex");
}

app.get("/list", checkBan, rateLimitDelegate, async (req, res) => {
  if (!req.query.levelid) return res.sendStatus(400);
  if (!/^\d+$/.test(req.query.levelid)) return res.sendStatus(418);
  if (req.query.platformer != "true" && req.query.platformer != "false")
    return res.sendStatus(400);
  let levelId = parseInt(req.query.levelid);
  let isPlatformer = req.query.platformer == "true";
  let inclPractice = req.query.practice != "false";

  let accept = req.query.response || "csv";
  if (accept != "csv" && accept != "bin") return res.sendStatus(400);

  let { deaths, columns } = await db.list(levelId, isPlatformer, inclPractice);

  res.contentType(accept == "csv" ? "text/csv" : "application/octet-stream");

  (accept == "csv" ? csvStream : binaryStream)(deaths, columns).pipe(res);
});

app.get("/analysis", checkBan, rateLimitDelegate, async (req, res) => {
  if (!req.query.levelid) return res.sendStatus(400);
  if (!/^\d+$/.test(req.query.levelid)) return res.sendStatus(418);
  let levelId = parseInt(req.query.levelid);

  let accept = req.query.response || "csv";
  if (accept != "csv" && accept != "bin") return res.sendStatus(400);

  let columns = "userident,levelversion,practice,x,y,percentage";
  let salt = "_" + random(10);

  let deaths = await db.analyze(levelId, columns);

  res.contentType(accept == "csv" ? "text/csv" : "application/octet-stream");

  (accept == "csv" ? csvStream : binaryStream)(deaths, columns,
    d => ([
      crypto.createHash("sha1")
        .update(d[0] + salt).digest("hex"),
      ...d.slice(1)
    ])
  ).pipe(res);
});

app.all("/submit", checkBan, rateLimitDelegate, expr.text({
  type: "*/*"
}), async (req, res) => {
  try {
    req.body = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).send("Wrongly formatted JSON");
  }
  let format;
  try {
    format = req.body.format;

    if (typeof format != "number") return res.status(400).send("Format not supplied");

    // i dont even care if this causes a 500, the mod sends the id in the body anyway so this will only get triggered by nerds
    req.body.levelid ||= parseInt(req.query.levelid);
    if (typeof req.body.levelid != "number")
      return res.status(400).send("levelid was not supplied or not numerical");
    // Silently skip ignored levels
    if (excluded.includes(req.body.levelid)) return res.sendStatus(204);

    if (typeof req.body.levelversion != "number") req.body.levelversion = 0;

    req.body.practice = (!!req.body.practice) * 1;

    if (typeof req.body.userident != "string") {
      if (!req.body.playername || !req.body.userid)
        return res.status(400).send("Neither userident nor playername and userid were supplied");

      req.body.userident = createUserIdent(req.body.userid,
        req.body.playername, req.body.levelid);
    } else {
      if (!/^[0-9a-f]{40}$/i.test(req.body.userident))
        return res.status(400).send("userident has incorrect length or illegal characters " +
          "(should be 40 hex characters)");
    }

    if (typeof req.body.percentage != "number")
      return res.status(400).send("percentage was not supplied or not numerical");
    req.body.percentage = Math.min(99, Math.max(0, req.body.percentage));

    if (typeof req.body.x != "number")
      return res.status(400).send("x was not supplied or not numerical");
    if (typeof req.body.y != "number")
      return res.status(400).send("y was not supplied or not numerical");

    if (format >= 2) {
      if (!req.body.coins) {
        req.body.coins =
          Number(!!req.body.coin1) |
          Number(!!req.body.coin2) << 1 |
          Number(!!req.body.coin3) << 2;
      }
      if (!req.body.itemdata) req.body.itemdata = 0;
    }

  } catch (e) {
    console.warn(e);
    return res.status(400).send("Unexpected error when parsing request");
  }

  try {
    await db.register(format, req.body);
    res.sendStatus(204);
  } catch (e) {
    console.warn(e);
    return res.status(500).send("Error writing to the database. May be due to wrongly " +
      "formatted input. Try again.");
  }
});

app.get("/robots.txt", (req, res) => {
  res.contentType("text/plain");
  res.send(robots);
});

app.get("*", (req, res) => {
  guide = req.path.slice(1) || "index";
  if (guide in guideHtml) {
    res.header("Cross-Origin-Opener-Policy", "same-origin");
    res.header("X-Frame-Options", "DENY");
    res.contentType("text/html");
    res.send(guideHtml[guide]);
  } else res.redirect("/");
});

app.all("*", (req, res) => {
  res.redirect("/");
});

app.listen(PORT, () => { console.log("Listening on :" + PORT) });
