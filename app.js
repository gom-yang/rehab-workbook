"use strict";

const main = document.querySelector("#main");
const speech = window.speechSynthesis;
const reviewKey = "rehab-workbook.review.v1";
for (const [tag, title] of reviewGroups) {
  exercises.push({
    id: `review-${tag}`, title, domain: "복습", kind: "review", levels: ["저장된 문제"],
    makeItems: () => load(reviewKey, []).filter(entry => entry?.tags?.includes(tag) &&
      byId[entry.id]?.kind !== "review" && byId[entry.id]?.makeItems(entry.level)?.[entry.index])
  });
}
const ids = exercises.map(({ id }) => id);
const byId = Object.fromEntries(exercises.map(exercise => [exercise.id, exercise]));
const matchingVoices = () => (speech?.getVoices() ?? []).filter(voice => /^ko\b/i.test(voice.lang) && voice.localService);
const settingsKey = "rehab-workbook.settings.v2";
const recordsKey = "rehab-workbook.records.v1";
let session;
let timer;
let audioRun = 0;
let draft;

function load(key, fallback, valid = Array.isArray) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return valid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function normalizeNumber(value, fallback, min, max, integer = true) {
  if (value === "" || value == null || !Number.isFinite(Number(value))) return fallback;
  const number = Math.min(max, Math.max(min, Number(value)));
  return integer ? Math.round(number) : number;
}

function defaultRow(id) {
  const exercise = byId[id];
  return { id, level: 0, count: exercise.kind === "sudoku" ? 1 : Math.max(1, Math.min(10, exercise.makeItems(0).length)) };
}

function configuration() {
  const legacy = load("rehab-workbook.selected.v1", defaultIds);
  const legacyIds = defaultIds.filter(id => legacy.includes(id));
  const saved = load(settingsKey, {}, value => value && Array.isArray(value.plan));
  const plan = (saved.plan ?? (legacyIds.length ? legacyIds : defaultIds).map(defaultRow))
    .filter(row => row && ids.includes(row.id))
    .map(({ id, level, count }) => ({
      id, level: normalizeNumber(level, 0, 0, byId[id].levels.length - 1),
      count: normalizeNumber(count, defaultRow(id).count, 1, 50)
    }));
  const voice = saved.voice ?? {};
  return { plan, voice: {
    rate: normalizeNumber(voice.rate, timing.rate, 0.5, 1.5, false),
    repeats: normalizeNumber(voice.repeats, timing.repeats, 1, 5),
    wait: normalizeNumber(voice.wait, timing.wait, 0, 60),
    rest: normalizeNumber(voice.rest, timing.rest, 0, 300)
  } };
}

function prepareStage(row) {
  const exercise = byId[row.id];
  const source = exercise.makeItems(row.level);
  const count = exercise.kind === "review" ? Math.min(row.count, source.length) : source.length ? row.count : 0;
  return { ...row, exercise, items: Array.from({ length: count }, (_, index) => source[index % source.length]) };
}

function totals(plan) {
  let questions = 0;
  let boards = 0;
  for (const { exercise, items } of plan) {
    if (exercise.kind === "sudoku") boards += items.length;
    else questions += items.length;
  }
  return [questions && `${questions}문제`, boards && `스도쿠 ${boards}판`].filter(Boolean).join(" + ") || "실행할 훈련 없음";
}

function show(html) {
  main.innerHTML = html;
  main.querySelector("h1")?.focus();
}

function button(action, label, secondary = false) {
  return `<button type="button" data-action="${action}" class="${secondary ? "secondary" : ""}">${label}</button>`;
}

function home() {
  const plan = configuration().plan.map(prepareStage);
  const menuMarkup = menus.map(({ title, groups }) => `
    <section class="tile"><h2>${title}</h2>
      ${groups.map(([group, ...items]) => `<details><summary>${group}</summary><ul>
        ${items.map(item => byId[typeof item === "string" ? item : item.id]
          ? `<li><a class="training-link" href="#practice/${typeof item === "string" ? item : item.id}">${typeof item === "string" ? byId[item].title : item.title}</a></li>`
          : `<li>${item}<span class="badge">준비 중</span></li>`).join("")}
      </ul></details>`).join("")}
    </section>`).join("");
  show(`
    <section class="hero"><p class="eyebrow" lang="en">REHAB WORKBOOK</p>
      <h1 tabindex="-1">함께 걷는 재활</h1><p>오늘도 우리만의 속도로</p>
      ${plan.some(stage => stage.items.length) ? '<a class="button" href="#today">오늘의 훈련 시작</a>' : '<a class="button" href="#settings">보호자 설정</a>'}
      <p class="muted">보호자가 설정한 맞춤 훈련 · ${totals(plan)}</p>
    </section>
    <section class="tile"><h2>맞춤 훈련 골라서 시작하기</h2><div class="actions">
      ${plan.map(({ exercise, items, level }, index) => items.length
        ? `<a class="button secondary" href="#planned/${index}">${exercise.title} · ${exercise.levels[level]} · ${items.length}${exercise.kind === "sudoku" ? "판" : "문제"}</a>`
        : `<span>${exercise.title} · 저장된 문제 없음</span>`).join("")}
    </div></section>
    <h2 style="margin-top:1.5rem">전체 훈련 메뉴</h2>
    <div class="grid">${menuMarkup}
      <section class="tile"><h2>복습하기</h2><ul>
        ${reviewGroups.map(([tag, title]) => `<li><a class="training-link" href="#practice/review-${tag}">${title}</a></li>`).join("")}
      </ul></section>
    </div>`);
}

function levels(exercise, selected) {
  return exercise.levels.map((label, index) =>
    `<option value="${index}" ${selected === index ? "selected" : ""}>${label}</option>`).join("");
}

function settings(focus) {
  const fields = [["rate", "음성 속도 (배)", 0.5, 1.5, 0.1], ["repeats", "반복 횟수", 1, 5, 1],
    ["wait", "따라 말하기 대기 (초)", 0, 60, 1], ["rest", "훈련 사이 휴식 (초)", 0, 300, 1]];
  main.innerHTML = `<section class="panel"><h1 tabindex="-1">보호자 설정</h1>
    <form id="settings"><fieldset><legend>오늘의 맞춤 훈련</legend>
      <p>변경하면 이 브라우저에 자동 저장돼요. 문제 수가 준비된 문제보다 많으면 같은 문제가 다시 나와요.</p>
      <label>추가할 훈련 <select id="add-training">${[...new Set(exercises.map(exercise => exercise.domain))].map(domain =>
        `<optgroup label="${domain}">${exercises.filter(exercise => exercise.domain === domain)
          .map(exercise => `<option value="${exercise.id}">${exercise.title}</option>`).join("")}</optgroup>`).join("")}</select></label>
      ${button("add", "추가")}
      <ol class="plan">${draft.plan.map(({ id, level, count }, index) => {
        const exercise = byId[id];
        return `<li data-row="${index}" class="plan-row"><strong>${exercise.title}</strong>
          <div class="actions"><label>난이도 <select name="level">${levels(exercise, level)}</select></label>
          <label>${exercise.kind === "sudoku" ? "판 수" : "문제 수"} <input name="count" type="number" min="1" max="50" value="${count}" required></label></div>
          <div class="actions">
            <button type="button" data-action="up" aria-label="${exercise.title} 위로" ${index === 0 ? "disabled" : ""}>위로</button>
            <button type="button" data-action="down" aria-label="${exercise.title} 아래로" ${index === draft.plan.length - 1 ? "disabled" : ""}>아래로</button>
            <button type="button" data-action="remove" aria-label="${exercise.title} 삭제">삭제</button>
          </div></li>`;
      }).join("")}</ol>
      <p id="total" aria-live="polite">${totals(draft.plan.map(prepareStage))}</p>
    </fieldset><fieldset><legend>음성 및 진행</legend>
      ${fields.map(([id, title, min, max, step]) => `<label>${title} <input name="${id}" type="number"
        min="${min}" max="${max}" step="${step}" value="${draft.voice[id]}" required></label>`).join("")}
    </fieldset><button>설정 저장</button><p id="feedback" role="status"></p></form></section>`;
  (main.querySelector(focus ?? "h1") ?? main.querySelector("#add-training")).focus();
}

function records() {
  const history = load(recordsKey, []).filter(entry =>
    entry && typeof entry.date === "number" && Number.isFinite(entry.date) &&
    new Date(entry.date).getTime() === entry.date && Number.isInteger(entry.count) && entry.count > 0
  );
  show(`<section class="panel"><h1 tabindex="-1">훈련 기록</h1>
    <p class="muted">완료한 훈련의 날짜와 종류 수를 이 브라우저에 저장합니다.</p>
    ${history.length ? `<ul>${history.map(({ date, count }) => `<li>${new Date(date).toLocaleString("ko-KR")} · ${count}종 완료</li>`).join("")}</ul>
    ${button("clear-records", "이 브라우저의 기록 지우기", true)}<p id="feedback" role="status"></p>`
    : "<p>아직 완료한 훈련이 없어요.</p>"}</section>`);
}

function stopAudio() {
  audioRun += 1;
  speech?.cancel();
  if (speech?.paused) speech.resume();
}

function stopTimer() {
  clearInterval(timer);
  timer = undefined;
}

function countdown(seconds, finished) {
  stopTimer();
  const output = document.querySelector("#timer");
  const toggle = document.querySelector('[data-action="pause"]');
  let remaining = seconds * 1000;
  let end = Date.now() + remaining;
  const tick = () => {
    remaining = Math.max(0, end - Date.now());
    output.textContent = `${Math.ceil(remaining / 1000)}초`;
    if (!remaining) {
      stopTimer();
      toggle.hidden = true;
      finished();
    }
  };
  toggle.hidden = false;
  toggle.textContent = "일시정지";
  toggle.onclick = () => {
    if (timer) {
      tick();
      if (!remaining) return;
      stopTimer();
      toggle.textContent = "계속하기";
    } else {
      end = Date.now() + remaining;
      timer = setInterval(tick, 200);
      toggle.textContent = "일시정지";
    }
  };
  timer = setInterval(tick, 200);
  tick();
}

function speak(text, followAlong = false) {
  stopTimer();
  stopAudio();
  const run = audioRun;
  const output = document.querySelector("#timer");
  const toggle = document.querySelector('[data-action="pause"]');
  const voice = matchingVoices()[0];
  const { rate, repeats, wait } = session.voice;
  const hint = document.querySelector("#voice-hint");
  function finish(message) {
    hint.textContent = message;
    output.textContent = "";
    toggle.hidden = true;
    if (followAlong) {
      countdown(wait, () => { output.textContent = "준비되면 다음 문제를 눌러 주세요."; });
    }
  }
  if (!voice || typeof SpeechSynthesisUtterance !== "function") {
    finish("기기에서 한국어 음성을 찾을 수 없어요.");
    return;
  }
  document.querySelector("#voice-hint").textContent = "";
  toggle.hidden = false;
  toggle.textContent = "일시정지";
  toggle.onclick = () => {
    if (speech.paused) {
      speech.resume();
      toggle.textContent = "일시정지";
    } else {
      speech.pause();
      toggle.textContent = "계속하기";
    }
  };
  let played = 0;
  function play() {
    if (run !== audioRun) return;
    played += 1;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.voice = voice;
    utterance.rate = rate;
    output.textContent = `듣기 ${played} / ${repeats}`;
    utterance.onend = () => {
      if (run !== audioRun) return;
      if (played < repeats) {
        play();
      } else {
        finish(followAlong ? "이제 천천히 따라 말해 보세요." : "");
      }
    };
    utterance.onerror = () => {
      if (run === audioRun) finish("음성을 재생할 수 없어요.");
    };
    speech.speak(utterance);
  }
  play();
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function currentExercise() {
  const stage = session.queue[session.stage];
  return stage.exercise.kind === "review" ? byId[stage.items[session.item].id] : stage.exercise;
}

function currentItem() {
  const stage = session.queue[session.stage];
  const item = stage.items[session.item];
  return stage.exercise.kind === "review" ? byId[item.id].makeItems(item.level)[item.index] : item;
}

function reviewReference() {
  const { exercise, level, items } = session.queue[session.stage];
  if (exercise.kind === "review") return items[session.item];
  return { id: exercise.id, level, index: session.item % exercise.makeItems(level).length };
}

function markReview(tag, toggle = false) {
  const { id, level, index } = reviewReference();
  const list = load(reviewKey, []).filter(entry => entry && Array.isArray(entry.tags));
  const previous = list.find(entry => entry.id === id && entry.level === level && entry.index === index);
  const tags = new Set(previous?.tags);
  if (toggle && tags.has(tag)) tags.delete(tag);
  else tags.add(tag);
  const remaining = list.filter(entry => entry !== previous);
  if (tags.size) remaining.unshift({ id, level, index, tags: [...tags] });
  const saved = save(reviewKey, remaining);
  if (toggle) {
    const control = main.querySelector(`[data-action="mark-${tag}"]`);
    if (saved) control.setAttribute("aria-pressed", String(tags.has(tag)));
    document.querySelector("#review-status").textContent = saved ? (tags.has(tag) ? "복습에 추가했어요." : "복습에서 뺐어요.") : "복습에 저장할 수 없었어요.";
  }
}

function audioControls(label, hidden = false) {
  return `<div id="audio" ${hidden ? "hidden" : ""}>
    <p id="voice-hint" role="status"></p><p id="timer" role="timer" aria-label="음성 및 대기 시간"></p>
    <div class="actions">${button("listen", label)}<button type="button" class="secondary" data-action="pause" hidden>일시정지</button></div>
  </div>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function choices(options) {
  return `<div class="actions">${shuffled(options.map((label, index) => ({ label, index })))
    .map(({ label, index }) => `<button type="button" class="choice" data-action="answer" data-index="${index}">${label}</button>`).join("")}</div>`;
}

function puzzleMarkup(item) {
  session.tiles = [item[1], item[3], item[0], item[2]];
  session.selectedTile = null;
  return `<p>그림 두 칸을 눌러 자리를 바꿔 보세요.</p>
    <p>완성할 그림</p><div class="picture-grid prompt">${item.map(tile => `<span>${tile}</span>`).join("")}</div>
    <div class="picture-grid">${session.tiles.map((tile, index) => `<button type="button" data-action="tile"
      data-index="${index}" aria-pressed="false" aria-label="${index + 1}번 칸 ${tile}">${tile}</button>`).join("")}</div>`;
}

const directions = [["위", -1, 0], ["왼쪽", 0, -1], ["오른쪽", 0, 1], ["아래", 1, 0]];

function mazeMarkup(item) {
  session.position = [0, 0];
  return `<p>화살표 버튼으로 파란 말을 도착점까지 옮기세요.</p>
    <div class="maze-grid" aria-hidden="true">${item.map((row, y) => [...row].map((cell, x) =>
      `<span data-maze="${y}-${x}" class="${cell === "#" ? "wall" : ""}">${y === 0 && x === 0 ? "🔵" : cell === "G" ? "🏁" : ""}</span>`).join("")).join("")}</div>
    <p id="maze-position" role="status">1행 1열</p>
    <div class="actions">${directions.map(([label], index) =>
      `<button type="button" data-action="step" data-index="${index}">${label}</button>`).join("")}</div>`;
}

function movePuzzle(control) {
  const index = Number(control.dataset.index);
  const previous = session.selectedTile;
  const tiles = [...main.querySelectorAll('[data-action="tile"]')];
  if (previous === null) {
    session.selectedTile = index;
    control.setAttribute("aria-pressed", "true");
    return;
  }
  const values = session.tiles;
  [values[previous], values[index]] = [values[index], values[previous]];
  session.selectedTile = null;
  for (const [position, tile] of tiles.entries()) {
    tile.textContent = values[position];
    tile.setAttribute("aria-label", `${position + 1}번 칸 ${values[position]}`);
    tile.setAttribute("aria-pressed", "false");
  }
  if (values.every((value, position) => value === currentItem()[position])) answer(true);
}

function moveMaze(control) {
  const [row, column] = session.position;
  const [, dy, dx] = directions[Number(control.dataset.index)];
  const y = row + dy;
  const x = column + dx;
  const cell = currentItem()[y]?.[x];
  const status = document.querySelector("#maze-position");
  if (!cell || cell === "#") {
    status.textContent = `${row + 1}행 ${column + 1}열 · 이 방향은 막혀 있어요.`;
    return;
  }
  main.querySelector(`[data-maze="${row}-${column}"]`).textContent = "";
  main.querySelector(`[data-maze="${y}-${x}"]`).textContent = "🔵";
  session.position = [y, x];
  status.textContent = `${y + 1}행 ${x + 1}열`;
  if (cell === "G") answer(true);
}

function question() {
  const exercise = currentExercise();
  const item = currentItem();
  const { kind } = exercise;
  const { items, exercise: stageExercise } = session.queue[session.stage];
  const spoken = kind === "repeat";
  const open = kind === "open" || kind === "write-open";
  const writing = kind.startsWith("write");
  const listening = kind === "listen" || kind === "write-listen";
  const { id, level, index } = reviewReference();
  const tags = load(reviewKey, []).find(entry => entry?.id === id && entry.level === level && entry.index === index)?.tags ?? [];
  session.answered = false;
  let html;
  if (spoken) {
    html = `<p>음성을 듣고 따라 말해 보세요.</p><div class="prompt">${item}</div>
      ${audioControls("듣기 / 다시 듣기")}`;
  } else if (kind === "sudoku") {
    const size = Math.sqrt(item.clues.length);
    const boxWidth = size === 4 ? 2 : 3;
    const boxHeight = size / boxWidth;
    html = `<p>가로줄, 세로줄, 굵은 선으로 나뉜 구역마다 1부터 ${size}까지 한 번씩 넣으세요.</p>
      <form id="sudoku"><div class="sudoku" style="--size:${size}">${item.clues.map((value, index) => {
        const row = Math.floor(index / size);
        const column = index % size;
        const edge = `${(column + 1) % boxWidth ? "" : " box-right"}${(row + 1) % boxHeight ? "" : " box-bottom"}`;
        return value ? `<span class="cell given${edge}">${value}</span>`
          : `<label class="cell${edge}"><input inputmode="numeric" maxlength="1" pattern="[1-${size}]" required aria-label="${row + 1}행 ${column + 1}열" data-cell="${index}"></label>`;
      }).join("")}</div>
      <button>확인</button></form>`;
  } else if (kind === "memory") {
    html = session.recall
      ? `<p>아까 본 내용을 떠올리고 답을 골라 주세요.</p>${choices(item.slice(1))}`
      : `<p>준비되면 내용을 가리고 기억한 것을 골라 주세요.</p>
         <div class="prompt">${item[0]}</div>${button("hide-picture", "가리기")}`;
  } else if (kind === "puzzle") {
    html = puzzleMarkup(item);
  } else if (kind === "maze") {
    html = mazeMarkup(item);
  } else {
    const [prompt, ...options] = item;
    const displayed = kind === "blank" ? [...prompt].map(char => char === "□"
      ? '<span class="blank" aria-label="빈칸"></span>' : char).join("") : prompt;
    html = `${kind === "blank" ? "<p>빈칸에 들어갈 글자를 골라 주세요.</p>" : listening ? "<p>문제를 듣고 답해 보세요.</p>" : ""}
      <div class="prompt" id="question-prompt" ${listening ? "hidden" : ""}>${listening ? "" : displayed}</div>
      ${listening ? audioControls("문제 듣기") + button("show-listening", "문제를 글로 보기", true) : ""}
      ${writing ? `<form id="written"><label>답 입력 <input name="response" type="text" autocomplete="off" required></label>
          ${open ? "" : "<button>확인</button>"}</form>`
        : open ? "" : choices(options)}
      ${open ? `${button("hint", kind === "write-open" ? "예시 보기" : "힌트 / 예시 보기", true)}
        <p id="example" role="status" hidden>${escapeHtml(options[0])}</p>${audioControls("문제 듣기")}` : ""}
      ${kind === "blank" ? audioControls("완성된 말 다시 듣기", true) : ""}`;
  }
  show(`<section class="panel"><p class="muted">${exercise.domain} 훈련 · ${session.stage + 1} / ${session.queue.length}종</p>
    <h1 tabindex="-1">${exercise.title}</h1>
    <p>${stageExercise.kind === "sudoku" ? "판" : "문제"} ${session.item + 1} / ${items.length}</p>
    ${html}<p id="feedback" role="status"></p>
    <div class="actions">
      <button type="button" data-action="next" ${spoken || open ? "" : "hidden"}>${session.item + 1 === items.length ? "이 훈련 마치기" : "다음 문제"}</button>
      <a class="button secondary" href="#home">훈련 나가기</a>
    </div>
    <details class="review-controls"><summary>복습에 저장</summary><div class="actions">
      ${[["favorite", "즐겨찾기"], ["assigned", "보호자 지정"], ...(kind === "blank" || exercise.id === "words" ? [["hard", "어려웠던 낱말"]] : [])]
        .map(([tag, title]) => `<button type="button" class="secondary" data-action="mark-${tag}" aria-pressed="${tags.includes(tag)}">${title}</button>`).join("")}
    </div><p id="review-status" role="status"></p></details></section>`);
}

function answer(correct, choice) {
  if (session.answered) return;
  const feedback = document.querySelector("#feedback");
  if (!correct) {
    markReview("wrong");
    feedback.textContent = "한 번 더 생각해 보세요.";
    return;
  }
  session.answered = true;
  if (currentExercise().kind === "blank") {
    const [prompt, solution] = currentItem();
    const blanks = [...main.querySelectorAll(".blank")];
    const origin = choice.getBoundingClientRect();
    blanks.forEach((blank, index) => {
      const letter = document.createElement("span");
      letter.className = "arriving-letter";
      letter.textContent = solution[index];
      blank.replaceChildren(letter);
      blank.removeAttribute("aria-label");
      blank.classList.add("filled");
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const target = blank.getBoundingClientRect();
        letter.animate?.([
          { transform: `translate(${origin.left + origin.width / 2 - target.left - target.width / 2}px, ${origin.top + origin.height / 2 - target.top - target.height / 2}px)` },
          { transform: "translate(0, 0)" }
        ], { duration: 380, easing: "ease-out" });
      }
    });
    document.querySelector("#audio").hidden = false;
    speak(prompt.replace(/□+/g, solution));
    feedback.textContent = `맞았어요! ${prompt.replace(/□+/g, solution)}`;
  } else {
    feedback.textContent = "맞았어요!";
  }
  const next = document.querySelector('[data-action="next"]');
  next.hidden = false;
  next.focus();
  main.querySelectorAll('.choice, #sudoku input, #sudoku button, #written input, #written button, [data-action="tile"], [data-action="step"]').forEach(control => {
    control.disabled = true;
  });
}

function next() {
  stopAudio();
  stopTimer();
  session.recall = false;
  session.item += 1;
  if (session.item < session.queue[session.stage].items.length) {
    question();
    return;
  }
  session.stage += 1;
  session.item = 0;
  if (session.stage < session.queue.length) {
    if (!session.voice.rest) {
      question();
      return;
    }
    show(`<section class="panel"><h1 tabindex="-1">잠깐 쉬어 가요</h1>
      <p>다음 훈련은 ${currentExercise().title}입니다.</p>
      <div id="timer" class="prompt" role="timer" aria-label="남은 휴식 시간"></div>
      <div class="actions">${button("pause", "일시정지", true)}
      <button type="button" data-action="resume-training" disabled>다음 훈련 시작</button>
      <a class="button secondary" href="#home">훈련 나가기</a></div></section>`);
    countdown(session.voice.rest, () => {
      document.querySelector("#timer").textContent = "휴식이 끝났어요.";
      document.querySelector('[data-action="resume-training"]').disabled = false;
    });
    return;
  }
  const entry = { date: Date.now(), count: session.queue.length };
  const saved = save(recordsKey, [entry, ...load(recordsKey, [])].slice(0, 30));
  show(`<section class="panel"><h1 tabindex="-1">훈련을 마쳤어요!</h1>
    <p>${entry.count}종 완료 · ${saved ? "이 브라우저에 기록을 저장했어요." : "브라우저에 기록을 저장할 수 없었어요."}</p>
    <div class="actions"><a class="button" href="#home">홈으로</a>
    <a class="button secondary" href="#records">훈련 기록</a></div></section>`);
}

function route() {
  stopTimer();
  stopAudio();
  session = undefined;
  const hash = location.hash.slice(1);
  const [page, id] = hash.split("/");
  if (page === "today" || page === "planned" || (page === "practice" && ids.includes(id))) {
    const { plan, voice } = configuration();
    if (page === "practice" && byId[id].levels.length > 1) {
      const exercise = byId[id];
      show(`<section class="panel"><h1 tabindex="-1">${exercise.title}</h1>
        <form id="practice" data-id="${id}"><label>난이도 <select name="level">${levels(exercise, 0)}</select></label>
        <button>훈련 시작</button></form><a class="training-link" href="#home">홈으로</a></section>`);
      return;
    }
    const rows = page === "today" ? plan : page === "planned" ? [plan[Number(id)]].filter(Boolean)
      : [{ ...defaultRow(id), count: byId[id].kind === "review" ? 50 : defaultRow(id).count }];
    start(rows, voice);
  } else if (page === "settings") {
    draft = configuration();
    settings();
  } else if (page === "records") {
    records();
  } else {
    home();
  }
}

function start(rows, voice) {
  const queue = rows.map(prepareStage).filter(stage => stage.items.length);
  if (!queue.length) {
    show('<section class="panel"><h1 tabindex="-1">실행할 훈련이 없어요</h1><p>맞춤 목록에 훈련을 추가하거나 복습할 문제를 먼저 저장해 주세요.</p><a class="button" href="#home">홈으로</a></section>');
    return;
  }
  session = { queue, voice, stage: 0, item: 0, recall: false };
  question();
}

function editPlan(control) {
  const action = control.dataset.action;
  const index = Number(control.closest("[data-row]")?.dataset.row);
  if (action === "add") {
    draft.plan.push(defaultRow(document.querySelector("#add-training").value));
    settings(`[data-row="${draft.plan.length - 1}"] select`);
  } else if (action === "remove") {
    draft.plan.splice(index, 1);
    settings(`[data-row="${Math.min(index, draft.plan.length - 1)}"] select`);
  } else {
    const newIndex = index + (action === "up" ? -1 : 1);
    const [row] = draft.plan.splice(index, 1);
    draft.plan.splice(newIndex, 0, row);
    settings(`[data-row="${newIndex}"] [data-action="${action}"]:not(:disabled), [data-row="${newIndex}"] select`);
  }
  persistSettings();
}

function persistSettings() {
  const feedback = document.querySelector("#feedback");
  feedback.textContent = save(settingsKey, draft) ? "이 브라우저에 설정을 저장했어요." : "설정을 저장할 수 없었어요.";
}

main.addEventListener("click", event => {
  const control = event.target.closest("button[data-action]");
  if (!control) return;
  switch (control.dataset.action) {
    case "add": case "remove": case "up": case "down": editPlan(control); break;
    case "next": {
      const form = document.querySelector("#written");
      if (currentExercise().kind !== "write-open" || form.reportValidity()) next();
      break;
    }
    case "listen": {
      const item = currentItem();
      const { kind } = currentExercise();
      const line = kind === "repeat" ? item : kind === "blank" ? item[0].replace(/□+/g, item[1]) : item[0];
      speak(line, kind === "repeat");
      break;
    }
    case "hint": {
      const example = document.querySelector("#example");
      example.hidden = false;
      markReview("hint");
      speak(currentItem()[1]);
      break;
    }
    case "show-listening": {
      const prompt = document.querySelector("#question-prompt");
      prompt.textContent = currentItem()[0];
      prompt.hidden = false;
      markReview("hint");
      break;
    }
    case "mark-favorite": case "mark-assigned": case "mark-hard":
      markReview(control.dataset.action.slice(5), true);
      break;
    case "hide-picture": session.recall = true; question(); break;
    case "tile": movePuzzle(control); break;
    case "step": moveMaze(control); break;
    case "answer": answer(control.dataset.index === "0", control); break;
    case "resume-training": question(); break;
    case "clear-records":
      if (window.confirm("이 브라우저의 훈련 기록을 모두 지울까요?")) {
        if (save(recordsKey, [])) records();
        else document.querySelector("#feedback").textContent = "기록을 지울 수 없었어요.";
      }
      break;
  }
});

main.addEventListener("input", event => {
  const field = event.target;
  if (field.form?.id !== "settings" || !field.name || !field.validity.valid) return;
  const row = field.closest("[data-row]");
  if (row) {
    draft.plan[Number(row.dataset.row)][field.name] = Number(field.value);
    document.querySelector("#total").textContent = totals(draft.plan.map(prepareStage));
  } else {
    draft.voice[field.name] = Number(field.value);
  }
  persistSettings();
});

main.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "settings") {
    persistSettings();
  } else if (form.id === "practice") {
    const row = defaultRow(form.dataset.id);
    row.level = Number(new FormData(form).get("level"));
    start([row], configuration().voice);
  } else if (form.id === "written") {
    if (currentExercise().kind === "write-open") next();
    else {
      const response = new FormData(form).get("response").trim().normalize();
      answer(response === currentItem()[1].normalize());
    }
  } else if (form.id === "sudoku") {
    const solution = currentItem().solution;
    answer([...form.querySelectorAll("input")].every(input => Number(input.value) === solution[input.dataset.cell]));
  }
});

window.addEventListener("hashchange", route);
window.addEventListener("pagehide", () => {
  stopTimer();
  stopAudio();
});
window.addEventListener("pageshow", event => {
  if (event.persisted) route();
});
route();
