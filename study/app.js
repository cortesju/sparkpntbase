// Course runner for the RTK study tab. Three views, addressed by the URL hash so a
// chapter can be linked to directly:
//   #                     the course
//   #ch/<chapter-id>      the chapter, its lessons and the test button
//   #ch/<chapter-id>/test the end-of-chapter test
//
// Progress lives in localStorage: which lessons are done, any notes, and the best
// test score per chapter. Nothing leaves the browser.
(function () {
  const KEY = "pntlab-course-v1";
  const PASS = 0.8;                 // a chapter counts as passed at 80 percent
  const FINAL = { id: "final", title: "Final mixed review", exam: [] };

  let state = load();
  let open = {};                    // which lessons are expanded, per chapter view
  let noting = {};                  // which lessons have their note box open
  let revealed = {};                // quick checks whose answer has been compared
  let exam = null;                  // the run in progress
  let tries = {};                   // what you typed into a quick check, kept across re-renders

  // Options are shuffled per run, so the answer key cannot be learned by position.
  // A run stores its own option order and the index the right answer landed on.
  function shuffled(q) {
    if (q.type !== "mc") return Object.assign({}, q);
    const order = q.options.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return Object.assign({}, q, { options: order.map(i => q.options[i]), answer: order.indexOf(q.answer) });
  }

  // Spacing and interleaving: every test after the first opens with two questions
  // drawn from earlier chapters, because retrieval works best spread out and mixed.
  function warmUp(ch, n) {
    const before = COURSE.slice(0, COURSE.indexOf(ch));
    const pool = [];
    before.forEach(c => c.exam.forEach(q => pool.push(Object.assign({ from: c.title }, q))));
    const picked = [];
    while (picked.length < Math.min(n, pool.length)) {
      const q = pool[Math.floor(Math.random() * pool.length)];
      if (!picked.includes(q)) picked.push(q);
    }
    return picked;
  }

  function load() {
    try { return Object.assign({ lessons: {}, exams: {} }, JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch { return { lessons: {}, exams: {} }; }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
  const lesson = id => state.lessons[id] || (state.lessons[id] = { done: false, note: "" });
  const result = id => state.exams[id] || null;

  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const app = document.getElementById("app");

  // A study area can carry one quick check or several; the data uses `check` or `checks`.
  const checksOf = l => l.checks || (l.check ? [l.check] : []);

  // ---------- progress helpers ----------
  const chapterDone = ch => ch.lessons.filter(l => lesson(l.id).done).length;
  const chapterPassed = ch => { const r = result(ch.id); return !!r && r.best >= Math.ceil(ch.exam.length * PASS); };
  function courseProgress() {
    const lessons = COURSE.reduce((n, c) => n + c.lessons.length, 0);
    const done = COURSE.reduce((n, c) => n + chapterDone(c), 0);
    const passed = COURSE.filter(chapterPassed).length;
    return { lessons, done, passed, chapters: COURSE.length };
  }

  // ---------- view: the course ----------
  function viewCourse() {
    const p = courseProgress();
    app.className = "";
    app.innerHTML = `
      <section class="hero" style="padding-left:0;padding-right:0">
        <div class="kicker">RTK course · ${COURSE.length} chapters</div>
        <h1>Learn it in order, then prove it.</h1>
        <p>Each chapter is a handful of short study areas: read them, follow the links as deep as you want to go,
        then take the chapter test. Answers are typed or multiple choice, and you need ${Math.round(PASS * 100)}% to pass a chapter.</p>
      </section>

      <div class="course-head">
        <div class="stat"><div class="num">${p.done}<span style="font-size:1.2rem;color:#bbb">/${p.lessons}</span></div>
          <div class="lbl">study areas read</div></div>
        <div class="stat"><div class="num">${p.passed}<span style="font-size:1.2rem;color:#bbb">/${p.chapters}</span></div>
          <div class="lbl">chapters passed</div></div>
        <div style="flex:2 1 260px">
          <div class="bar"><span class="done" style="width:${(p.done / p.lessons) * 100}%"></span></div>
        </div>
      </div>

      <div class="chapters">
        ${COURSE.map((ch, i) => {
          const done = chapterDone(ch), r = result(ch.id), passed = chapterPassed(ch);
          const chip = !r ? `<span class="score-chip score-none">test not taken</span>`
            : passed ? `<span class="score-chip score-pass">passed ${r.best}/${ch.exam.length}</span>`
                     : `<span class="score-chip score-try">best ${r.best}/${ch.exam.length}</span>`;
          return `
          <button class="chapter-card${passed ? " complete" : ""}" data-ch="${ch.id}">
            <span class="n">${passed ? "✓" : i + 1}</span>
            <span>
              <h2>${esc(ch.title)}</h2>
              <div class="goal">${esc(ch.goal)}</div>
              <div class="bar"><span class="done" style="width:${(done / ch.lessons.length) * 100}%"></span></div>
              <div class="meta"><span>${ch.lessons.length} study areas</span><span>${ch.exam.length} questions</span><span>about ${ch.minutes} min</span></div>
            </span>
            <span class="right">${chip}<span style="font-size:.78rem;color:#999">${done}/${ch.lessons.length} read</span></span>
          </button>`;
        }).join("")}
      </div>

      <div class="final-cta">
        <div style="flex:1;min-width:230px">
          <h3>Final mixed review</h3>
          <p>Fifteen questions pulled at random from every chapter, in mixed order. This is the one that tells you
          whether it stuck, because nothing here warns you which chapter a question came from.</p>
        </div>
        <button class="btn btn-primary" id="final">${result("final") ? "Take it again" : "Start the final"}</button>
      </div>

      <div class="toolbar">
        <button class="btn btn-outline btn-sm" id="export">Export my notes</button>
        <button class="btn btn-outline btn-sm" data-go="glossary">Glossary</button>
        <span class="spacer"></span>
        <button class="btn-ghost" id="reset">Reset all progress</button>
      </div>`;
  }

  // ---------- view: one chapter ----------
  function viewChapter(ch) {
    const i = COURSE.indexOf(ch), done = chapterDone(ch), r = result(ch.id), passed = chapterPassed(ch);
    const next = COURSE[i + 1];
    app.className = "";
    app.innerHTML = `
      <div class="crumb"><a data-go="">Course</a> › Chapter ${i + 1}</div>
      <div class="chapter-hero">
        <h1>${esc(ch.title)}</h1>
        <p class="goal">${esc(ch.goal)}</p>
        <div class="meta">${ch.lessons.length} study areas · about ${ch.minutes} min · ${done}/${ch.lessons.length} read</div>
      </div>

      <div style="margin:1.5rem 0">
        ${ch.lessons.map(l => {
          const st = lesson(l.id);
          const isOpen = open[l.id], isNoting = noting[l.id];
          return `
          <section class="lesson${st.done ? " done" : ""}${isOpen ? " open" : ""}${isNoting ? " noting" : ""}" data-lesson="${l.id}">
            <div class="lesson-head" data-toggle="${l.id}">
              <span class="tick" data-tick="${l.id}" title="Mark as read">✓</span>
              <h3>${esc(l.title)}</h3>
              <span class="chev">▶</span>
            </div>
            <div class="lesson-body">
              ${l.body.map(t => `<p>${esc(t)}</p>`).join("")}
              ${l.figure ? `<figure class="fig">${l.figure}</figure>` : ""}
              ${l.steps ? `<ol class="steps">${l.steps.map(st =>
                `<li><b>${esc(st.do)}</b><span>${esc(st.why)}</span></li>`).join("")}</ol>` : ""}
              ${l.keys && l.keys.length ? `<div class="keys"><h4>Worth remembering</h4><ul>${l.keys.map(k => `<li>${esc(k)}</li>`).join("")}</ul></div>` : ""}
              ${l.links && l.links.length ? `<div class="links">${l.links.map(k =>
                `<a class="${k.kind}" href="${esc(k.url)}" target="_blank" rel="noopener"><span class="kind">${esc(k.kind)}</span>${esc(k.label)}</a>`).join("")}</div>` : ""}
              ${checksOf(l).map((c, ci) => {
                const key = l.id + "#" + ci;
                return `<div class="qcheck${revealed[key] ? " shown" : ""}" data-check="${key}">
                  <div class="q">Quick check: ${esc(c.q)}</div>
                  ${revealed[key] ? "" : `<textarea class="qc-try" data-try="${key}"
                     placeholder="Answer from memory first, then compare.">${esc(tries[key] || "")}</textarea>`}
                  ${revealed[key] && tries[key] ? `<div class="qc-mine"><b>You said</b>${esc(tries[key])}</div>` : ""}
                  <div class="a">${esc(c.a)}</div>
                  ${revealed[key] ? "" : `<button data-reveal="${key}"${(tries[key] || "").trim() ? "" : " disabled"}>Compare with the answer</button>`}
                </div>`;
              }).join("")}
              <button class="note-btn${st.note ? " has" : ""}" data-note="${l.id}">${st.note ? "Your note" : "Add a note"}</button>
              <textarea class="note-area" data-notearea="${l.id}" placeholder="Anything confusing here is a documentation gap worth reporting.">${esc(st.note)}</textarea>
            </div>
          </section>`;
        }).join("")}
      </div>

      <div class="exam-cta">
        <div style="flex:1;min-width:220px">
          <h3>Chapter ${i + 1} test</h3>
          <p>${ch.exam.length} questions, multiple choice and written. ${Math.ceil(ch.exam.length * PASS)} correct to pass.
          ${r ? `Your best so far: ${r.best}/${ch.exam.length} over ${r.taken} ${r.taken === 1 ? "attempt" : "attempts"}.` : "Not attempted yet."}</p>
        </div>
        <button class="btn btn-primary" data-test="${ch.id}">${r ? "Take it again" : "Start the test"}</button>
      </div>

      <div class="toolbar">
        <button class="btn-ghost" data-go="">Back to the course</button>
        <span class="spacer"></span>
        ${next && passed ? `<button class="btn btn-outline btn-sm" data-go="ch/${next.id}">Next: ${esc(next.title)}</button>` : ""}
      </div>`;
  }

  // ---------- view: the test ----------
  function startExam(ch) {
    const items = warmUp(ch, 2).concat(ch.exam).map(shuffled);
    exam = { ch, items, i: 0, answers: items.map(() => null), graded: items.map(() => null),
             scored: items.map(q => !q.from) };     // warm-up questions do not count toward the chapter score
    location.hash = "ch/" + ch.id + "/test";
    viewExam();
  }

  // The final exam: fifteen questions drawn from the whole course, mixed.
  function startFinal() {
    const pool = [];
    COURSE.forEach(c => c.exam.forEach(q => pool.push(Object.assign({ from: c.title }, q))));
    const items = [];
    while (items.length < Math.min(15, pool.length)) {
      const q = pool[Math.floor(Math.random() * pool.length)];
      if (!items.includes(q)) items.push(q);
    }
    const mixed = items.map(shuffled);
    exam = { ch: FINAL, items: mixed, i: 0, answers: mixed.map(() => null), graded: mixed.map(() => null),
             scored: mixed.map(() => true), final: true };
    location.hash = "final";
    viewExam();
  }

  function gradeText(q, typed) {
    const t = (typed || "").toLowerCase();
    if (!t.trim()) return false;
    const need = q.accept || [];
    const hits = need.filter(k => t.includes(k.toLowerCase())).length;
    return need.length ? hits >= Math.ceil(need.length * 0.6) : false;
  }

  function viewExam() {
    const { ch, i } = exam;
    const q = exam.items[i], picked = exam.answers[i], graded = exam.graded[i];
    app.className = "";

    const dots = exam.items.map((_, n) => {
      const g = exam.graded[n];
      return `<i class="${n === i ? "on" : ""}${g === true ? " right" : g === false ? " wrong" : ""}"></i>`;
    }).join("");

    let bodyHtml;
    if (q.type === "mc") {
      bodyHtml = `<div class="opts">${q.options.map((o, n) => {
        let cls = "";
        if (graded !== null) {
          if (n === q.answer) cls = " right";
          else if (n === picked) cls = " wrong";
        } else if (n === picked) cls = " picked";
        return `<button class="opt${cls}" data-opt="${n}"${graded !== null ? " disabled" : ""}>
          <span class="letter">${"abcd"[n]}</span><span>${esc(o)}</span></button>`;
      }).join("")}</div>`;
    } else {
      bodyHtml = `<textarea class="answer-box" id="typed" ${graded !== null ? "disabled" : ""}
        placeholder="Answer in your own words...">${esc(picked || "")}</textarea>`;
    }

    let verdict = "";
    if (graded !== null) {
      verdict = `
        <div class="verdict ${graded ? "right" : "wrong"}">
          <h4>${graded ? "Correct" : "Not quite"}</h4>
          ${q.why ? `<div>${esc(q.why)}</div>` : ""}
          ${q.type === "text" ? `<div class="model"><b>The answer we were looking for</b>${esc(q.answer)}</div>
            <div class="self">Graded on keywords, so it can be wrong about you.
              <button data-self="${graded ? 0 : 1}">${graded ? "Mark it wrong" : "I had this right"}</button></div>` : ""}
        </div>`;
    }

    app.innerHTML = `
      <div class="crumb"><a data-go="">Course</a> › <a data-go="ch/${ch.id}">${esc(ch.title)}</a> › Test</div>
      <div class="dots">${dots}</div>
      <div class="qcard">
        <div class="qnum">Question ${i + 1} of ${exam.items.length}${q.type === "mc" ? " · choose one" : " · written answer"}${(q.from && !exam.scored[i]) ? ` · warm-up from ${esc(q.from)}` : ""}</div>
        <div class="qtext">${esc(q.q)}</div>
        ${bodyHtml}
        ${verdict}
        <div class="exam-actions">
          ${graded === null
            ? `<button class="btn btn-primary btn-sm" id="submit">Check my answer</button>`
            : `<button class="btn btn-primary btn-sm" id="next">${i + 1 < exam.items.length ? "Next question" : "See the result"}</button>`}
          <span class="spacer"></span>
          <button class="btn-ghost" data-go="${exam.final ? "" : "ch/" + ch.id}">Leave the test</button>
        </div>
      </div>`;
  }

  function viewResult() {
    const { ch } = exam;
    const counted = exam.items.map((q, n) => exam.scored[n] ? n : -1).filter(n => n >= 0);
    const score = counted.filter(n => exam.graded[n]).length;
    const total = counted.length;
    const need = Math.ceil(total * PASS);
    const passed = score >= need;
    const warm = exam.items.length - total;

    const prev = result(ch.id);
    state.exams[ch.id] = { best: Math.max(score, prev ? prev.best : 0), last: score, taken: (prev ? prev.taken : 0) + 1 };
    save();

    const i = COURSE.indexOf(ch), next = COURSE[i + 1];
    app.className = "";
    app.innerHTML = `
      <div class="crumb"><a data-go="">Course</a>${exam.final ? "" : ` › <a data-go="ch/${ch.id}">${esc(ch.title)}</a>`} › Result</div>
      <div class="qcard result ${passed ? "pass" : "fail"}">
        ${warm ? `<p style="font-size:.82rem;color:#999;margin-bottom:1rem">${warm} warm-up ${warm === 1 ? "question" : "questions"} from earlier chapters are shown below but not counted here.</p>` : ""}
        <div class="ring"><span class="pc">${Math.round((score / total) * 100)}%</span><span class="of">${score} of ${total}</span></div>
        <h2>${passed ? "Chapter passed" : "Not passed yet"}</h2>
        <p>${passed
            ? "That is the standard. Move on, and come back to anything below that you want to firm up."
            : `You need ${need} of ${total}. Re-read the study areas behind the ones you missed and take it again - the questions stay the same, so the point is the understanding rather than the score.`}</p>
        <div style="display:flex;gap:.7rem;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" ${exam.final ? 'id="final-again"' : `data-test="${ch.id}"`}>Take it again</button>
          ${exam.final ? `<button class="btn btn-outline btn-sm" data-go="">Back to the course</button>`
            : passed && next ? `<button class="btn btn-outline btn-sm" data-go="ch/${next.id}">Next chapter</button>`
                             : `<button class="btn btn-outline btn-sm" data-go="ch/${ch.id}">Back to the chapter</button>`}
        </div>

        <div class="review">
          <h3>Every question</h3>
          <ul>${exam.items.map((q, n) => {
            const ok = exam.graded[n];
            const mine = q.type === "mc" ? (exam.answers[n] === null ? "no answer" : q.options[exam.answers[n]]) : (exam.answers[n] || "no answer");
            return `<li class="${ok ? "ok" : "no"}">
              <div class="rq"><span class="mark">${ok ? "✓" : "✗"}</span>${esc(q.q)}${(q.from && !exam.scored[n]) ? ` <em style="color:#999;font-style:normal;font-size:.8rem">(warm-up, not scored)</em>` : ""}</div>
              <div class="ra">You said: ${esc(mine)}</div>
              ${ok ? "" : `<div class="ra"><b>Answer:</b> ${esc(q.type === "mc" ? q.options[q.answer] : q.answer)}</div>`}
            </li>`;
          }).join("")}</ul>
        </div>
      </div>`;
  }

  // ---------- view: the glossary ----------
  function viewGlossary() {
    app.className = "";
    app.innerHTML = `
      <div class="crumb"><a data-go="">Course</a> › Glossary</div>
      <div class="chapter-hero">
        <h1>Glossary</h1>
        <p class="goal">Every term and acronym the course uses. If one of them stops you mid-lesson, it is here.</p>
      </div>
      <input type="search" id="gfilter" class="gfilter" placeholder="Filter, for example NTRIP or datum">
      <dl class="glossary">
        ${GLOSSARY.map(([term, def]) => `<div class="gitem"><dt>${esc(term)}</dt><dd>${esc(def)}</dd></div>`).join("")}
      </dl>
      <div class="toolbar"><button class="btn-ghost" data-go="">Back to the course</button></div>`;
  }

  // Ticking a lesson, opening one, revealing a quick check or answering a question all
  // re-render the view. Re-rendering resets the scroll position, which loses the reader's
  // place, so local changes go through here: capture the offset, redraw, put it back.
  // Navigation (a different chapter, a new question) still starts at the top on purpose.
  function inPlace(fn) {
    const y = window.scrollY;
    fn();
    window.scrollTo(0, y);
  }

  // ---------- routing ----------
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    const parts = h.split("/").filter(Boolean);
    if (parts[0] === "glossary") { exam = null; viewGlossary(); window.scrollTo(0, 0); return; }
    if (parts[0] === "final") {
      if (!exam || !exam.final) startFinal(); else viewExam();
      return;
    }
    if (parts[0] === "ch") {
      const ch = COURSE.find(c => c.id === parts[1]);
      if (!ch) { location.hash = ""; return; }
      if (parts[2] === "test") {
        if (!exam || exam.ch !== ch) startExam(ch); else viewExam();
        return;
      }
      exam = null;
      viewChapter(ch);
      window.scrollTo(0, 0);
      return;
    }
    exam = null;
    viewCourse();
  }

  // ---------- events ----------
  app.addEventListener("click", e => {
    const go = e.target.closest("[data-go]");
    if (go) { location.hash = go.dataset.go; return; }

    const card = e.target.closest("[data-ch]");
    if (card) { location.hash = "ch/" + card.dataset.ch; return; }

    const test = e.target.closest("[data-test]");
    if (test) { startExam(COURSE.find(c => c.id === test.dataset.test)); return; }

    const tick = e.target.closest("[data-tick]");
    if (tick) {
      const st = lesson(tick.dataset.tick);
      st.done = !st.done; save();
      inPlace(route); e.stopPropagation(); return;
    }

    const toggle = e.target.closest("[data-toggle]");
    if (toggle) {
      const id = toggle.dataset.toggle;
      open[id] = !open[id];
      inPlace(route); return;
    }

    const reveal = e.target.closest("[data-reveal]");
    if (reveal) { revealed[reveal.dataset.reveal] = true; inPlace(route); return; }

    const note = e.target.closest("[data-note]");
    if (note) {
      const id = note.dataset.note;
      noting[id] = !noting[id]; open[id] = true;
      inPlace(route);
      const box = document.querySelector(`[data-notearea="${id}"]`);
      if (box) box.focus({ preventScroll: true });
      return;
    }

    const opt = e.target.closest("[data-opt]");
    if (opt && exam) { exam.answers[exam.i] = +opt.dataset.opt; inPlace(viewExam); return; }

    if (e.target.id === "submit" && exam) {
      const q = exam.items[exam.i];
      if (q.type === "text") {
        const box = document.getElementById("typed");
        exam.answers[exam.i] = box.value;
        exam.graded[exam.i] = gradeText(q, box.value);
      } else {
        if (exam.answers[exam.i] === null) return;      // nothing picked yet
        exam.graded[exam.i] = exam.answers[exam.i] === q.answer;
      }
      inPlace(viewExam); return;
    }

    const self = e.target.closest("[data-self]");
    if (self && exam) { exam.graded[exam.i] = self.dataset.self === "1"; inPlace(viewExam); return; }

    if (e.target.id === "next" && exam) {
      if (exam.i + 1 < exam.items.length) { exam.i++; viewExam(); window.scrollTo(0, 0); }
      else viewResult();
      return;
    }

    if (e.target.id === "final" || e.target.id === "final-again") { startFinal(); return; }
    if (e.target.id === "export") { exportNotes(); return; }
    if (e.target.id === "reset") {
      if (!confirm("Clear every lesson tick, note and test score in this browser?")) return;
      state = { lessons: {}, exams: {} }; save(); route(); return;
    }
  });

  app.addEventListener("input", e => {
    const box = e.target.closest("[data-notearea]");
    if (box) { lesson(box.dataset.notearea).note = box.value; save(); return; }
    if (e.target.id === "gfilter") {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll(".gitem").forEach(el =>
        el.style.display = el.textContent.toLowerCase().includes(q) ? "" : "none");
      return;
    }
    const attempt = e.target.closest("[data-try]");
    if (attempt) {
      tries[attempt.dataset.try] = attempt.value;
      const btn = attempt.parentElement.querySelector("[data-reveal]");
      if (btn) btn.disabled = !attempt.value.trim();
    }
  });

  // Notes are documentation feedback, so make them easy to hand over
  function exportNotes() {
    const lines = ["# Study notes and documentation gaps", ""];
    COURSE.forEach(ch => {
      const withNotes = ch.lessons.filter(l => (state.lessons[l.id] || {}).note);
      if (!withNotes.length) return;
      lines.push("## " + ch.title, "");
      withNotes.forEach(l => lines.push("- **" + l.title + "**: " + state.lessons[l.id].note));
      lines.push("");
    });
    if (lines.length === 2) { alert("No notes yet. Add one from any study area."); return; }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "rtk-study-notes.md";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  window.addEventListener("hashchange", route);
  route();
})();
