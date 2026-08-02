/* Rigsby West portal · Family First Division · AnnieMac
   Single-page app. Demo mode runs off bundled seed until config.js has real keys.
   Live mode: Google sign-in, Firestore data, server-side rules enforce access. */
(function () {
  "use strict";

  var HAS_SEED = !!(window.RW_SEED && window.RW_SEED.deals);
  var NO_KEYS = !window.RW_CONFIG || window.RW_CONFIG.apiKey === "PASTE_ME";
  var DEMO = NO_KEYS && HAS_SEED;   // demo needs bundled data; the publish bundle ships without it
  if (NO_KEYS && !HAS_SEED) {
    document.addEventListener("DOMContentLoaded", function () {
      document.getElementById("app").innerHTML =
        '<div class="login-hero"><div class="panel"><h2 class="section">Setup in progress</h2>' +
        '<p class="sub" style="margin-top:12px">Keys are not in config.js yet. Finish the Firebase window in the README, paste the three keys, and this page comes alive.</p></div></div>';
    });
  }
  var db = null, fb = null;
  if (!DEMO) {
    fb = firebase.initializeApp(window.RW_CONFIG);
    db = firebase.firestore();
  }

  var S = {            // session state
    email: null, user: null, view: "home", dealId: null,
    seed: window.RW_SEED, dwell: {}, dwellTimer: null
  };

  // ---------------- utilities ----------------
  function $(id) { return document.getElementById(id); }
  function h(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content; }
  function money(n) { return "$" + Number(n).toLocaleString("en-US"); }
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.style.display = "block"; setTimeout(function () { t.style.display = "none"; }, 2600); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---------------- activity logging (disclosed) ----------------
  function log(type, data) {
    var ev = Object.assign({ type: type, email: S.email || "anon", at: new Date().toISOString() }, data || {});
    if (DEMO) { console.log("[activity]", ev); return; }
    db.collection("activity").add(Object.assign(ev, { at: firebase.firestore.FieldValue.serverTimestamp() })).catch(function () {});
  }
  function startDwell() {
    stopDwell();
    S.dwellTimer = setInterval(function () {
      var secs = {};
      document.querySelectorAll("[data-sec]").forEach(function (el) {
        var r = el.getBoundingClientRect();
        var visible = r.top < window.innerHeight * 0.8 && r.bottom > 80;
        if (visible) secs[el.getAttribute("data-sec")] = true;
      });
      Object.keys(secs).forEach(function (k) { S.dwell[k] = (S.dwell[k] || 0) + 5; });
    }, 5000);
  }
  function stopDwell() { if (S.dwellTimer) clearInterval(S.dwellTimer); S.dwellTimer = null; }
  function flushDwell() {
    var keys = Object.keys(S.dwell);
    if (!keys.length) return;
    keys.forEach(function (k) { log("dwell", { section: k, seconds: S.dwell[k], view: S.view, deal: S.dealId }); });
    S.dwell = {};
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) flushDwell(); });

  // ---------------- data access (demo vs live) ----------------
  function getUser(email, cb) {
    if (DEMO) return cb(S.seed.users[email] || null);
    db.collection("users").doc(email).get().then(function (d) { cb(d.exists ? d.data() : null); }, function () { cb(null); });
  }
  function getDeals(cb) {
    if (DEMO) {
      var out = [];
      Object.keys(S.seed.deals).forEach(function (k) { out.push(Object.assign({ id: k }, S.seed.deals[k])); });
      return cb(out);
    }
    db.collection("deals").get().then(function (q) {
      var out = []; q.forEach(function (d) { out.push(Object.assign({ id: d.id }, d.data())); }); cb(out);
    });
  }
  function getDealFull(id, cb) {
    if (DEMO) return cb((S.seed.deals[id] || {}).privateFull || null);
    db.collection("deals").doc(id).collection("private").doc("full").get()
      .then(function (d) { cb(d.exists ? d.data() : null); }, function () { cb(null); });
  }
  function getPipeline(board, cb) {
    if (DEMO) {
      var out = [];
      Object.keys(S.seed.pipelines).forEach(function (k) {
        if (S.seed.pipelines[k].board === board) out.push(S.seed.pipelines[k]);
      });
      return cb(out);
    }
    db.collection("pipelines").where("board", "==", board).get().then(function (q) {
      var out = []; q.forEach(function (d) { out.push(d.data()); }); cb(out);
    });
  }
  function getConfig(doc, cb) {
    if (DEMO) return cb(S.seed.config[doc] || null);
    db.collection("config").doc(doc).get().then(function (d) { cb(d.exists ? d.data() : null); }, function () { cb(null); });
  }

  // ---------------- shells ----------------
  function brandbar(active) {
    var u = S.user;
    var tabs = [["home", "Boards"], ["pipes", "Recruiting"]];
    if (u && u.roles && u.roles.dealCreator) tabs.push(["newdeal", "New Deal"]);
    if (u && u.roles && u.roles.admin) tabs.push(["admin", "Admin"]);
    var nav = tabs.map(function (t) {
      return '<button class="btn ghost sm ' + (active === t[0] ? "active" : "") + '" data-nav="' + t[0] + '">' + t[1] + "</button>";
    }).join("");
    return '<div class="appbar">' +
      '<div class="brandlock">' +
      '<svg class="sigmark" width="34" height="18" viewBox="0 0 34 18"><path d="M1 12 H10 L14 12 17 3 20 15 23 12 H33"/></svg>' +
      '<span class="wordmark">RIGSBY&nbsp;WEST</span>' +
      '<span class="org">Family First Division · AnnieMac</span></div>' +
      '<div style="display:flex;gap:8px;align-items:center">' + nav +
      '<span class="chip"><span class="dot"></span>' + esc((u && u.name) || "") + "</span>" +
      '<button class="btn ghost sm" data-nav="signout">Sign out</button></div></div><hr class="signal-line">' +
      (DEMO ? '<div class="demo-banner">DEMO MODE · running on bundled data · goes live after the two console windows</div>' : "");
  }

  // ---------------- views ----------------
  function viewLogin(msg) {
    stopDwell();
    $("app").innerHTML =
      '<div class="login-hero"><div class="panel">' +
      '<svg class="sigmark" width="60" height="30" viewBox="0 0 34 18"><path d="M1 12 H10 L14 12 17 3 20 15 23 12 H33"/></svg>' +
      '<h1 class="display" style="margin:14px 0 6px">RIGSBY WEST</h1>' +
      '<div class="kicker">Family First Division · AnnieMac Home Mortgage</div>' +
      (msg ? '<p class="sub" style="margin-top:16px;color:var(--warn)">' + esc(msg) + "</p>" : "") +
      '<div style="margin-top:26px"><button class="btn primary" id="signin">Sign in with Google</button></div>' +
      '<p class="notice">Private workspace. Access is by invitation and every sign-in and page view is logged to keep the room secure and make the tools better. Internal use only.</p>' +
      "</div></div>";
    $("signin").onclick = function () {
      if (DEMO) {
        S.email = "derek.rigsby@gmail.com";
        getUser(S.email, function (u) { S.user = u; log("signin", {}); go("home"); });
        return;
      }
      var provider = new firebase.auth.GoogleAuthProvider();
      firebase.auth().signInWithPopup(provider).catch(function (e) { toast("Sign-in failed: " + e.message); });
    };
  }

  function milestrip(m) {
    var out = '<div class="milestrip">';
    for (var i = 1; i <= 8; i++) out += '<div class="m' + (i <= m ? " on" : "") + '"></div>';
    return out + "</div>";
  }

  function viewHome() {
    getDeals(function (deals) {
      var lvl = S.user.surfaces.deals;
      var cards = deals.map(function (d) {
        return '<div class="card click rowlink" data-deal="' + d.id + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<span class="chip gold"><span class="dot"></span>' + esc(d.code) + "</span>" +
          '<span class="chip"><span class="dot"></span>' + esc(d.milestoneLabel) + "</span></div>" +
          '<h2 class="section" style="margin-top:14px">' + esc(d.name) + "</h2>" +
          '<p class="sub" style="margin-top:6px">' + esc(d.market) + "</p>" +
          milestrip(d.milestone) +
          '<div class="milelabel">' + esc(d.loanAnalog) + "</div>" +
          (lvl !== "status" ? '<p class="sub" style="margin-top:12px">' + esc(d.summary) + "</p>" : "") +
          "</div>";
      }).join("");
      $("app").innerHTML = brandbar("home") +
        '<div class="sec" data-sec="board-head"><div class="kicker gold">Division board · active pursuits</div>' +
        '<h1 class="display" style="margin-top:8px">The deals on the table</h1></div>' +
        '<div class="sec grid g2" data-sec="board-cards">' + cards + "</div>" +
        '<div class="sec" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px">' +
        '<span class="foot-note">Every number graded. Verified, Verbal, or Pending, with a named source.</span>' +
        '<span class="motto">FIND THE SIGNAL · CUT THE NOISE</span></div>';
      wireNav(); wireDealLinks();
      log("view", { view: "home" }); startDwell();
    });
  }

  function dealShareFF(d) {
    var s = d.share, bars = "";
    var max = Math.max.apply(null, s.monthly.units);
    s.monthly.units.forEach(function (u, i) {
      var w = max ? Math.round(u / max * 100) : 0;
      bars += '<div class="bar"><span class="lbl">' + s.monthly.labels[i] + "</span>" +
        '<div class="track"><div class="fill" style="width:' + w + '%"></div></div>' +
        '<span class="v">' + u + "</span></div>";
    });
    return '<div class="sec grid g4" data-sec="ff-tiles">' +
      '<div class="tile"><div class="label">Funded units · T12</div><div class="value">' + s.units + '</div><div class="foot"><b>' + s.purchasePct + '%</b> purchase by units</div></div>' +
      '<div class="tile"><div class="label">Government share</div><div class="value">' + s.govPct + '<span class="unit">%</span></div><div class="foot">' + esc(s.govFoot || "government share of units") + "</div></div>" +
      '<div class="tile"><div class="label">Core-market purchase units</div><div class="value" style="font-size:38px">' + esc(s.azPurchase) + '</div><div class="foot">' + esc(s.azFoot || "") + "</div></div>" +
      '<div class="tile"><div class="label">Best month</div><div class="value" style="font-size:38px">' + esc(s.bestMonth) + '</div><div class="foot">trailing twelve</div></div></div>' +
      '<div class="sec panel" data-sec="ff-monthly"><div class="hd"><h2 class="section">Monthly funded units</h2>' +
      '<span class="chip pending"><span class="dot"></span>' + esc(s.flags[0]) + '</span></div><div class="bd"><div class="bars">' + bars + "</div></div></div>";
  }

  function dealFullFF(full) {
    if (!full) return "";
    var mix = (full.mix || []).map(function (r) {
      return "<tr><td>" + esc(r.label) + '</td><td class="num">' + r.units + '</td><td class="num">' + money(r.volume) + "</td></tr>";
    }).join("");
    var ag = (full.agents || []).map(function (r) {
      return "<tr><td>" + esc(r.name) + "</td><td>" + esc(r.brokerage) + '</td><td class="num">' + r.sides + '</td><td class="num">' + money(r.dollars) + "</td></tr>";
    }).join("");
    return '<div class="sec grid g3" data-sec="ff-econ">' +
      '<div class="tile"><div class="label">Funded volume · T12</div><div class="value" style="font-size:34px">' + money(full.volume) + '</div><div class="foot">Avg loan <b>' + money(full.avgLoan) + "</b></div></div>" +
      '<div class="tile"><div class="label">Breakeven volume</div><div class="value" style="font-size:26px;color:var(--ink-3)">' + esc(full.breakeven.volume) + '</div><div class="foot">House rule: breakeven leads every book</div></div>' +
      '<div class="tile"><div class="label">Shocks · minus 25 / 37.5 bps</div><div class="value" style="font-size:26px;color:var(--ink-3)">' + esc(full.breakeven.shock25) + '</div><div class="foot">No parity offsets, ever</div></div></div>' +
      '<div class="sec grid g2" data-sec="ff-detail">' +
      '<div class="panel"><div class="hd"><h2 class="section">Repeat buyer-side agents</h2><span class="chip"><span class="dot"></span>T12 · verified</span></div>' +
      '<div class="bd"><table class="sig"><tr><th>Agent</th><th>Brokerage</th><th class="num">Sides</th><th class="num">$ touched</th></tr>' + ag + "</table></div></div>" +
      '<div class="panel"><div class="hd"><h2 class="section">Book shape</h2><span class="chip"><span class="dot"></span>Grade: Verified</span></div>' +
      '<div class="bd"><table class="sig"><tr><th>Cut</th><th class="num">Units</th><th class="num">Volume</th></tr>' + mix + "</table></div></div></div>";
  }

  function dealShareTR(d) {
    var tiles = (d.share.tiles || []).map(function (t) {
      return '<div class="tile"><div class="label">' + esc(t.k) + '</div><div class="value" style="font-size:30px">' + esc(t.v) + "</div></div>";
    }).join("");
    return '<div class="sec grid g3" data-sec="tr-tiles">' + tiles + "</div>" +
      '<div class="sec panel" data-sec="tr-note"><div class="bd"><p class="sub">' + esc(d.share.note) + "</p></div></div>";
  }

  function viewDeal(id) {
    getDeals(function (deals) {
      var d = deals.filter(function (x) { return x.id === id; })[0];
      if (!d) return go("home");
      S.dealId = id;
      var lvl = S.user.surfaces.deals;
      var canFull = S.user.surfaces.economics === "full" && (d.leg !== "DIV" || S.user.divisionDealsOk || (S.user.roles && S.user.roles.admin));
      var body = d.id === "FF-001" ? dealShareFF(d) : dealShareTR(d);
      $("app").innerHTML = brandbar("home") +
        '<div class="sec" data-sec="deal-head" style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px"><div>' +
        '<div class="kicker gold">' + esc(d.code) + " · " + esc(d.milestoneLabel) + " · " + esc(d.loanAnalog) + "</div>" +
        '<h1 class="display" style="margin-top:8px">' + esc(d.name) + " · " + esc(d.market) + "</h1>" +
        '<p class="sub" style="margin-top:8px">' + esc(d.grade) + "</p></div>" +
        '<div style="display:flex;gap:8px"><button class="btn primary" id="meetbtn">Start meeting</button>' +
        (canFull ? '<button class="btn ghost" id="fullbtn">Full economics</button>' : "") + "</div></div>" +
        milestrip(d.milestone) + body +
        '<div class="sec" data-sec="deal-next"><div class="panel"><div class="bd"><span class="kicker gold">Next step</span>' +
        '<p style="margin-top:8px">' + esc(d.share.nextStep || "") + "</p></div></div></div>" +
        '<div id="fullzone"></div>';
      wireNav();
      $("meetbtn").onclick = function () { meetingModal(d); };
      if (canFull) $("fullbtn").onclick = function () {
        if (!confirm("Open full economics for " + d.code + "?")) return;
        getDealFull(d.id, function (full) {
          $("fullzone").innerHTML = d.id === "FF-001" ? dealFullFF(full) :
            '<div class="sec panel" data-sec="tr-full"><div class="bd"><p class="sub">' + esc((full || {}).note || "") + "</p></div></div>";
          log("view", { view: "deal-full", deal: d.id });
        });
      };
      log("view", { view: "deal", deal: id }); startDwell();
    });
  }

  function viewPipes() {
    getPipeline("individual", function (ind) {
      getPipeline("teams", function (teams) {
        function rows(list) {
          return list.map(function (r) {
            return '<tr class="' + (r.dealId ? "rowlink" : "") + '"' + (r.dealId ? ' data-deal="' + r.dealId + '"' : "") + ">" +
              "<td>" + esc(r.name) + "</td><td>" + esc(r.market) + "</td><td>" + esc(r.milestoneLabel) +
              "</td><td>" + esc(r.loanAnalog) + "</td><td>" + esc(r.next) + "</td></tr>";
          }).join("");
        }
        var head = "<tr><th>Name</th><th>Market</th><th>Milestone</th><th>Loan analog</th><th>Next</th></tr>";
        $("app").innerHTML = brandbar("pipes") +
          '<div class="sec" data-sec="pipes-head"><div class="kicker gold">Recruiting · the sales process reads like a loan</div>' +
          '<h1 class="display" style="margin-top:8px">Pipelines</h1>' +
          '<p class="sub" style="margin-top:8px">Prospecting, Application, Processing, Underwriting, Conditional Approval, Clear to Close, Funded, Boarded.</p></div>' +
          '<div class="sec panel" data-sec="pipes-ind"><div class="hd"><h2 class="section">Individual hires</h2></div><div class="bd"><table class="sig">' + head + rows(ind) + "</table></div></div>" +
          '<div class="sec panel" data-sec="pipes-team"><div class="hd"><h2 class="section">Teams</h2></div><div class="bd"><table class="sig">' + head + rows(teams) + "</table></div></div>";
        wireNav(); wireDealLinks();
        log("view", { view: "pipes" }); startDwell();
      });
    });
  }

  function viewNewDeal() {
    if (!(S.user.roles && S.user.roles.dealCreator)) return go("home");
    getConfig("legs", function (legs) {
      getConfig("buildMenu", function (menu) {
        var legOpts = (legs.list || []).map(function (l) { return '<option value="' + esc(l.id) + '">' + esc(l.label) + "</option>"; }).join("");
        var checks = (menu.list || []).map(function (m) {
          return '<label><input type="checkbox" name="bm" value="' + esc(m.id) + '"' + (m.id === "record" ? " checked disabled" : "") + "> " + esc(m.label) + "</label>";
        }).join("");
        $("app").innerHTML = brandbar("newdeal") +
          '<div class="sec"><div class="kicker gold">Authorized only · two-way identity check runs before anything is created</div>' +
          '<h1 class="display" style="margin-top:8px">New Deal</h1></div>' +
          '<div class="sec panel" style="max-width:640px"><div class="bd">' +
          '<label class="f">NMLS ID</label><input class="f" id="nd-nmls" inputmode="numeric" placeholder="745233">' +
          '<label class="f">Full name, exactly as licensed</label><input class="f" id="nd-name" placeholder="First Last">' +
          '<label class="f">Leg</label><select class="f" id="nd-leg">' + legOpts + "</select>" +
          '<label class="f">Build</label><div class="checks">' + checks + "</div>" +
          '<div style="margin-top:24px;display:flex;gap:10px"><button class="btn primary" id="nd-go">Create deal</button>' +
          '<span class="sub" style="align-self:center">Record appears at Prospecting. Artifacts publish as they verify.</span></div>' +
          "</div></div>";
        wireNav();
        $("nd-go").onclick = function () {
          var nmls = $("nd-nmls").value.trim(), name = $("nd-name").value.trim();
          if (!/^\d{4,9}$/.test(nmls)) return toast("NMLS ID must be the number alone.");
          if (name.split(/\s+/).length < 2) return toast("Full name required. The identity check needs both.");
          var items = Array.prototype.slice.call(document.querySelectorAll('input[name="bm"]:checked')).map(function (c) { return c.value; });
          var ticket = { nmls: nmls, name: name, leg: $("nd-leg").value, items: items, requestedBy: S.email, at: new Date().toISOString(), status: "queued" };
          if (DEMO) { log("buildTicket", ticket); toast("Demo: ticket queued for " + name + "."); return; }
          db.collection("buildTickets").add(ticket).then(function () {
            log("buildTicket", { nmls: nmls, name: name });
            toast("Deal queued. The record lights up as verification lands.");
          }, function (e) { toast("Not authorized or offline: " + e.message); });
        };
        log("view", { view: "newdeal" }); startDwell();
      });
    });
  }

  function viewAdmin() {
    if (!(S.user.roles && S.user.roles.admin)) return go("home");
    function render(events) {
      var byPerson = {};
      events.forEach(function (e) {
        var k = e.email || "unknown";
        byPerson[k] = byPerson[k] || { views: 0, dwell: 0, meetings: 0, deals: {} };
        if (e.type === "view") byPerson[k].views++;
        if (e.type === "dwell") byPerson[k].dwell += (e.seconds || 0);
        if (e.type === "meeting") byPerson[k].meetings++;
        if (e.deal) byPerson[k].deals[e.deal] = (byPerson[k].deals[e.deal] || 0) + 1;
      });
      var rows = Object.keys(byPerson).map(function (k) {
        var p = byPerson[k];
        var deals = Object.keys(p.deals).map(function (d) { return d + " ×" + p.deals[d]; }).join(", ") || "none yet";
        return "<tr><td>" + esc(k) + '</td><td class="num">' + p.views + '</td><td class="num">' + Math.round(p.dwell / 60) + ' min</td><td class="num">' + p.meetings + "</td><td>" + esc(deals) + "</td></tr>";
      }).join("");
      $("app").innerHTML = brandbar("admin") +
        '<div class="sec"><div class="kicker gold">Admin · visible to you alone</div>' +
        '<h1 class="display" style="margin-top:8px">Engagement</h1>' +
        '<p class="sub" style="margin-top:8px">Who opened what, where they lingered, who has not looked yet. The morning digest reads from this same well.</p></div>' +
        '<div class="sec panel"><div class="bd"><table class="sig"><tr><th>Person</th><th class="num">Views</th><th class="num">Time on pages</th><th class="num">Meetings</th><th>Deals touched</th></tr>' +
        (rows || '<tr><td colspan="5">No activity logged yet.</td></tr>') + "</table></div></div>" +
        '<div class="sec panel"><div class="bd"><span class="kicker gold">Roles and access</span>' +
        '<p class="sub" style="margin-top:8px">Users, roles, and surface levels live in the users collection. Add a person by creating their doc with the email they sign in with, then set active true. Corey stays inactive until his gate clears. Jodey division economics flips with divisionDealsOk.</p></div></div>' +
        '<div class="sec panel"><div class="bd"><span class="kicker gold">Initialize workspace · one time</span>' +
        '<p class="sub" style="margin-top:8px">Paste the contents of seed.json from your local demo copy, then load. Writes users, config, deals, and pipelines in one shot. Safe to run once; it will not overwrite an existing workspace unless you confirm.</p>' +
        '<p class="sub" style="margin-top:10px">Easiest way, no copying: pick the file straight off your computer.</p>' +
        '<input type="file" id="seedfile" accept=".json,application/json" class="f" style="margin-top:8px;padding:9px">' +
        '<p class="sub" style="margin-top:14px">Or paste the text instead.</p>' +
        '<textarea class="f" id="seedbox" rows="6" placeholder="paste seed.json here" style="margin-top:8px"></textarea>' +
        '<div style="margin-top:14px"><button class="btn primary" id="seedgo">Load workspace data</button></div>' +
        '<div id="seedstatus" style="margin-top:14px;font:500 12px/1.6 var(--font-mono);white-space:pre-wrap"></div></div></div>';
      wireNav();
      function stat(msg, isErr) {
        var el = $("seedstatus");
        if (!el) return;
        el.style.color = isErr ? "var(--crit)" : "var(--good)";
        el.textContent = msg;
      }
      var sf = $("seedfile");
      if (sf) sf.onchange = function () {
        var f = sf.files && sf.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          $("seedbox").value = fr.result;
          stat("File read: " + f.name + ", " + fr.result.length + " characters. Now click Load workspace data.");
        };
        fr.onerror = function () { stat("Could not read that file. Try the paste box instead.", true); };
        fr.readAsText(f);
      };
      var sg = $("seedgo");
      if (sg) sg.onclick = function () {
        try {
          stat("Working...");
          var raw = $("seedbox").value.trim();
          if (!raw) return stat("Nothing loaded yet. Use the file picker above, or paste the text.", true);
          raw = raw.replace(/[“”‘’]/g, '"');
          var data;
          try { data = JSON.parse(raw); }
          catch (e) { return stat("The paste is not complete JSON. " + e.message + ". Open seed.json, select all, copy again, and make sure the last character pasted is a closing brace.", true); }
          if (!data.users || !data.deals || !data.config) {
            return stat("Parsed, but this does not look like seed.json. It needs users, config, deals, and pipelines sections. Copy the whole file.", true);
          }
          // The database refuses a list inside a list. Older seed files carried a few.
          // Repair them here so any version of the file loads cleanly.
          var repaired = 0;
          var KEYS = {
            mix: ["label", "units", "volume"],
            agents: ["name", "brokerage", "sides", "dollars"],
            tiles: ["k", "v"]
          };
          function repair(node, keyName) {
            if (Array.isArray(node)) {
              var inner = KEYS[keyName] || null;
              return node.map(function (item) {
                if (Array.isArray(item)) {
                  repaired++;
                  var obj = {};
                  item.forEach(function (val, i) { obj[inner && inner[i] ? inner[i] : "v" + i] = val; });
                  return obj;
                }
                return repair(item, keyName);
              });
            }
            if (node && typeof node === "object") {
              var out = {};
              Object.keys(node).forEach(function (k) { out[k] = repair(node[k], k); });
              return out;
            }
            return node;
          }
          data = repair(data, "root");
          if (repaired) stat("Adjusted " + repaired + " list fields from an older file version. Continuing...");
          if (DEMO) return stat("This page is running in demo mode, so there is no live database to load. Open the live site address, not the local file.", true);
          stat("Checking the database connection...");
          db.collection("config").doc("legs").get().then(function (d) {
            if (d.exists && !confirm("Workspace already has data. Overwrite config, deals, and pipelines?")) { stat("Cancelled. Nothing changed."); return; }
            stat("Connection good. Preparing documents...");
            var batch, n = 0, where = "start";
            try {
              batch = db.batch();
              Object.keys(data.users || {}).forEach(function (em) {
                if (em.indexOf("PENDING") === -1) { where = "users/" + em; batch.set(db.collection("users").doc(em), data.users[em]); n++; }
              });
              Object.keys(data.config || {}).forEach(function (k) { where = "config/" + k; batch.set(db.collection("config").doc(k), data.config[k]); n++; });
              Object.keys(data.deals || {}).forEach(function (k) {
                var deal = Object.assign({}, data.deals[k]); var priv = deal.privateFull; delete deal.privateFull;
                where = "deals/" + k; batch.set(db.collection("deals").doc(k), deal); n++;
                if (priv) { where = "deals/" + k + "/private/full"; batch.set(db.collection("deals").doc(k).collection("private").doc("full"), priv); n++; }
              });
              Object.keys(data.pipelines || {}).forEach(function (k) { where = "pipelines/" + k; batch.set(db.collection("pipelines").doc(k), data.pipelines[k]); n++; });
            } catch (be) {
              return stat("The data was rejected while preparing " + where + ". Exact reason: " + be.message + ". Send these words to your builder.", true);
            }
            stat("Writing " + n + " documents...");
            batch.commit().then(
              function () { stat("DONE. " + n + " documents written. Open Boards at the top and the deals are live."); toast("Workspace loaded."); },
              function (e) { stat("The database refused the write. Exact reason: " + (e.code || "") + " " + e.message + ". Send these words to your builder.", true); }
            ).catch(function (e3) { stat("Write stopped unexpectedly: " + e3.message, true); });
          }, function (e) {
            stat("Could not reach the database. Exact reason: " + (e.code || "") + " " + e.message + ". If this says permission-denied, the rules publish did not take. If it mentions network or blocked, a browser extension or firewall is stopping firestore.googleapis.com.", true);
          });
        } catch (e2) {
          stat("Unexpected error: " + e2.message, true);
        }
      };
      log("view", { view: "admin" }); startDwell();
    }
    if (DEMO) return render([{ email: "derek.rigsby@gmail.com", type: "view", deal: "FF-001" }]);
    db.collection("activity").orderBy("at", "desc").limit(500).get().then(function (q) {
      var out = []; q.forEach(function (d) { out.push(d.data()); }); render(out);
    }, function () {
      // never let a failed read hide the page: the setup panel must always appear
      render([]);
    });
  }

  // ---------------- meeting launch ----------------
  function meetingModal(deal) {
    var m = document.createElement("div");
    m.className = "modal open";
    m.innerHTML = '<div class="panel"><div class="bd">' +
      '<h2 class="section">Start a meeting · ' + esc(deal.code) + "</h2>" +
      '<label class="f">Title</label><input class="f" id="mt-title" value="' + esc(deal.code + " · " + deal.name) + '">' +
      '<label class="f">Invite emails, comma separated</label><input class="f" id="mt-who" placeholder="name@company.com, name2@company.com">' +
      '<label class="f">Notes for the invite</label><textarea class="f" id="mt-notes" rows="2">Working session on ' + esc(deal.name) + ". Agenda follows.</textarea>" +
      '<div style="margin-top:22px;display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="btn primary" id="mt-go">Open invite with Meet</button>' +
      '<button class="btn ghost" id="mt-x">Cancel</button></div>' +
      '<p class="notice">One click in the calendar adds Google Meet, Save sends the invites. The deal timeline logs this meeting the moment you launch. Recording and transcripts stay off until the consent confirm clears.</p>' +
      "</div></div>";
    document.body.appendChild(m);
    m.querySelector("#mt-x").onclick = function () { m.remove(); };
    m.querySelector("#mt-go").onclick = function () {
      var title = m.querySelector("#mt-title").value.trim();
      var who = m.querySelector("#mt-who").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      var notes = m.querySelector("#mt-notes").value.trim();
      var url = "https://calendar.google.com/calendar/render?action=TEMPLATE" +
        "&text=" + encodeURIComponent(title) +
        "&details=" + encodeURIComponent(notes) +
        (who.length ? "&add=" + encodeURIComponent(who.join(",")) : "");
      log("meeting", { deal: deal.id, invitees: who, title: title });
      if (!DEMO) db.collection("deals").doc(deal.id).collection("timeline").add({
        type: "meeting", by: S.email, invitees: who, title: title,
        at: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function () {});
      window.open(url, "_blank");
      m.remove();
      toast("Meeting logged to the deal timeline.");
    };
  }

  // ---------------- routing ----------------
  function wireNav() {
    document.querySelectorAll("[data-nav]").forEach(function (b) {
      b.onclick = function () {
        var v = b.getAttribute("data-nav");
        if (v === "signout") return signOut();
        go(v);
      };
    });
  }
  function wireDealLinks() {
    document.querySelectorAll("[data-deal]").forEach(function (el) {
      el.onclick = function () { go("deal", el.getAttribute("data-deal")); };
    });
  }
  function go(view, dealId) {
    flushDwell(); stopDwell();
    S.view = view; S.dealId = dealId || null;
    if (view === "home") return viewHome();
    if (view === "deal") return viewDeal(dealId);
    if (view === "pipes") return viewPipes();
    if (view === "newdeal") return viewNewDeal();
    if (view === "admin") return viewAdmin();
    viewHome();
  }
  function signOut() {
    flushDwell(); stopDwell();
    S.email = null; S.user = null;
    if (!DEMO) firebase.auth().signOut();
    viewLogin();
  }

  // ---------------- boot ----------------
  if (DEMO) {
    viewLogin();
  } else {
    var OWNER = "derek.rigsby@gmail.com";
    function ownerBootstrap() {
      return { name: "Derek Rigsby", active: true, divisionDealsOk: true,
        roles: { admin: true, dealCreator: true },
        surfaces: { deals: "full", economics: "full", pipelines: "full", dashboards: "full",
                    boards: true, leadLane: true, marketingLane: true } };
    }
    firebase.auth().onAuthStateChanged(function (fu) {
      if (!fu) return viewLogin();
      S.email = fu.email;
      getUser(S.email, function (u) {
        if (!u || u.active !== true) {
          if (S.email === OWNER) {
            // Owner signs in before any data exists. Bootstrap in memory,
            // land on Admin, and the workspace load writes the real documents.
            S.user = ownerBootstrap();
            log("signin", { bootstrap: true });
            toast("Welcome. Load the workspace data below to finish setup.");
            return go("admin");
          }
          firebase.auth().signOut();
          return viewLogin("This workspace is by invitation. Ask Derek for access.");
        }
        S.user = u; log("signin", {});
        go("home");
      });
    });
  }
})();
