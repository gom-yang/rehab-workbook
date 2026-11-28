"use strict";

const main = document.querySelector("#main");
const speech = window.speechSynthesis;
const reviewKey = "rehab-workbook.review.v1";
for (const [tag, title] of reviewGroups) {
  exercises.push({
    id: `review-${tag}`, title, domain: "복습", kind: "review", levels: ["저장된 문제"],
    makeItems: () => load(reviewKey, []).filter(entry => entry?.tags?.includes(tag) &&
      byId[entry.id] && byId[entry.id].kind !== "review" &&
      (entry.question || byId[entry.id].makeItems(entry.level)?.[entry.index]))
  });
}
const ids = exercises.map(({ id }) => id);
const byId = Object.fromEntries(exercises.map(exercise => [exercise.id, exercise]));
const matchingVoices = () => (speech?.getVoices() ?? []).filter(voice => /^ko\b/i.test(voice.lang));
const preferredMale = voice => /(?:^|\W)male(?:\W|$)|남성|남자|인준|봉진|재현|injun|bongjin|jaehyun|yuna\s*\(male\)/i.test(voice.name);
const voiceId = voice => voice.voiceURI || voice.name;
const chosenVoice = settings => {
  const voices = matchingVoices();
  return voices.find(voice => voiceId(voice) === settings.voiceId) ?? voices.find(preferredMale) ??
    voices.find(voice => voice.localService) ?? voices[0];
};
const settingsKey = "rehab-workbook.settings.v2";
const recordsKey = "rehab-workbook.records.v1";
const progressKey = "rehab-workbook.progress.v1";
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
  return { plan, textSize: ["normal", "large", "extra"].includes(saved.textSize) ? saved.textSize : "large", voice: {
    voiceId: typeof voice.voiceId === "string" ? voice.voiceId : "",
    rate: normalizeNumber(voice.rate, timing.rate, 0.5, 1.5, false),
    repeats: normalizeNumber(voice.repeats, timing.repeats, 1, 5),
    wait: normalizeNumber(voice.wait, timing.wait, 0, 60),
    rest: normalizeNumber(voice.rest, timing.rest, 0, 300)
  } };
}

function prepareStage(row) {
  const exercise = byId[row.id];
  const source = exercise.makeItems(row.level, row.count);
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

const homeFolders = [
  ["language", "언어 훈련", "말하기 · 듣기 · 읽기 · 쓰기"],
  ["cognition", "인지 훈련", "기억 · 계산 · 주의 등 8영역"],
  ["conversation", "생활 대화", "상황별 말하기 연습"],
  ["review", "복습하기", "다시 연습할 문제"]
];

function home() {
  const plan = configuration().plan.map(prepareStage);
  const ready = plan.some(stage => stage.items.length);
  const active = savedProgress();
  const cards = [
    ...homeFolders.map(([id, title, description]) => [id, title, description, `#menu/${id}`]),
    ["records", "훈련 기록", "마친 훈련 확인", "#records"],
    ["settings", "보호자 설정", "맞춤 훈련 변경", "#settings"]
  ];
  show(`<section class="home-screen">
    <h1 tabindex="-1"><span class="footprints" aria-hidden="true"></span>함께 걷는 재활</h1>
    ${active ? progressCard(active, ready) : `<a class="today-card" href="${ready ? "#today" : "#settings"}">
      <strong>오늘의 훈련 시작</strong>
      <span>맞춤 훈련 · ${totals(plan)}</span>
      <b><span aria-hidden="true">${ready ? "▶ " : ""}</span>${ready ? "시작하기" : "보호자 설정 열기"}</b>
    </a>`}
    <nav class="home-cards" aria-label="훈련 메뉴">
      ${cards.map(([id, title, description, link]) => `<a href="${link}" class="home-card tone-${id}">
        <strong>${title}</strong><span>${description}</span></a>`).join("")}
    </nav>
  </section>`);
}

function progressCard(active, ready) {
  const total = active.queue.reduce((sum, stage) => sum + stage.items.length, 0);
  const done = active.completed.length;
  const started = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(active.started);
  return `<section class="today-card"><h2>진행 중인 훈련이 있어요!</h2>
    <p>${started}에 시작한 훈련 · ${Math.round(done / total * 100)}% 완료 · 남은 문제·판 ${total - done}개</p>
    <a class="button forward-button" href="#today">이어서 훈련하기</a>
    <details><summary>훈련별 진행 상황</summary><ul>${active.queue.map((stage, index) => {
      const completed = active.completed.filter(item => item.stage === index).length;
      return `<li>${stage.exercise.title} · ${completed}/${stage.items.length} 완료</li>`;
    }).join("")}</ul></details>
    ${ready ? button("new-training", "새로운 훈련 시작하기", true) : ""}</section>`;
}

function menuPage(id) {
  const index = homeFolders.findIndex(([key]) => key === id);
  const [, title] = homeFolders[index];
  const groups = id === "review" ? [["다시 연습할 문제", ...reviewGroups.map(([tag]) => `review-${tag}`)]]
    : menus[index].groups;
  const content = groups.map(([name, ...items]) => {
    const makeLinks = entries => `<ul class="folder-links">${entries.map(item => {
      const exercise = byId[typeof item === "string" ? item : item.id];
      return exercise
        ? `<li><a class="training-link" href="#practice/${exercise.id}">${exercise.title}</a></li>`
        : `<li>${item}<span class="badge">준비 중</span></li>`;
    }).join("")}</ul>`;
    const operationItems = items.filter(item => item.id?.startsWith("arithmetic-"));
    const links = makeLinks(items.filter(item => !operationItems.includes(item))) + (operationItems.length
      ? `<details class="training-folder"><summary>사칙연산 훈련</summary>${makeLinks(operationItems)}</details>` : "");
    return groups.length === 1 ? links : `<details class="training-folder"><summary>${name}</summary>${links}</details>`;
  }).join("");
  show(`<section class="panel"><a class="training-link" href="#home">← 홈으로</a>
    <h1 tabindex="-1">${title}</h1><div class="folder-list">${content}</div></section>`);
}

function planIcon(exercise) {
  const byKind = {
    repeat: ["🎙", "language"], open: ["💬", "conversation"], blank: ["✎", "settings"],
    sudoku: ["▦", "cognition"], memory: ["🧠", "review"], listen: ["♫", "language"],
    write: ["✎", "settings"], "write-listen": ["✎", "settings"], "write-open": ["✎", "settings"],
    puzzle: ["🧩", "cognition"], maze: ["↱", "cognition"], review: ["↻", "review"]
  };
  const [icon, tone] = exercise.id === "phrases" ? ["💬", "language"]
    : exercise.id === "math" ? ["±", "cognition"] : byKind[exercise.kind] ?? ["✓", "language"];
  return `<span class="plan-icon tone-${tone}" aria-hidden="true">${icon}</span>`;
}

function levels(exercise, selected) {
  return exercise.levels.map((label, index) =>
    `<option value="${index}" ${selected === index ? "selected" : ""}>${label}</option>`).join("");
}

function settings(focus) {
  const fields = [["rate", "음성 속도 (배)", 0.5, 1.5, 0.1], ["repeats", "반복 횟수", 1, 5, 1],
    ["wait", "따라 말하기 대기 (초)", 0, 60, 1], ["rest", "훈련 사이 휴식 (초)", 0, 300, 1]];
  main.innerHTML = `<section class="panel settings-panel"><h1 tabindex="-1">보호자 설정</h1>
    <form id="settings"><fieldset><legend>오늘의 맞춤 훈련</legend>
      <p class="muted">훈련을 누르면 설정을 바꿀 수 있어요. 변경 내용은 자동 저장됩니다.</p>
      <p class="plan-total">전체 분량 <strong id="total" aria-live="polite">${totals(draft.plan.map(prepareStage))}</strong></p>
      <ol class="plan">${draft.plan.map(({ id, level, count }, index) => {
        const exercise = byId[id];
        return `<li data-row="${index}" class="plan-row"><details>
          <summary class="plan-summary">
            ${planIcon(exercise)}
            <span class="plan-name"><strong>${index + 1}. ${exercise.title}</strong>
            <span class="muted" data-level-label>${exercise.levels[level]}</span></span>
            <strong class="plan-count"><span data-count-label>${count}</span>${exercise.kind === "sudoku" ? "판" : "문제"}</strong>
          </summary>
          <div class="plan-editor">
          <div class="actions"><label>난이도 <select name="level">${levels(exercise, level)}</select></label>
          <label>${exercise.kind === "sudoku" ? "판 수" : "문제 수"} <input name="count" type="number" min="1" max="50" value="${count}" required></label></div>
          <div class="actions">
            <button type="button" data-action="up" aria-label="${exercise.title} 위로" ${index === 0 ? "disabled" : ""}>위로</button>
            <button type="button" data-action="down" aria-label="${exercise.title} 아래로" ${index === draft.plan.length - 1 ? "disabled" : ""}>아래로</button>
            <button type="button" data-action="remove" aria-label="${exercise.title} 삭제">삭제</button>
          </div></div></details></li>`;
      }).join("")}</ol>
      <div class="actions add-training"><label>추가할 훈련 <select id="add-training">${[...new Set(exercises.map(exercise => exercise.domain))].map(domain =>
        `<optgroup label="${domain}">${exercises.filter(exercise => exercise.domain === domain)
          .map(exercise => `<option value="${exercise.id}">${exercise.title}</option>`).join("")}</optgroup>`).join("")}</select></label>
      ${button("add", "추가")}</div>
      <small>준비된 문제보다 문제 수가 많으면 같은 문제가 다시 나와요.</small>
    </fieldset><fieldset><legend>음성 및 진행</legend>
      <label>한국어 음성 <select name="voiceId"></select></label>
      <p id="voice-availability" class="muted"></p>
      ${button("preview-voice", "선택한 음성 미리 듣기", true)}
      <p id="preview-status" role="status"></p>
      ${fields.map(([id, title, min, max, step]) => `<label>${title} <input name="${id}" type="number"
        min="${min}" max="${max}" step="${step}" value="${draft.voice[id]}" required></label>`).join("")}
    </fieldset><fieldset><legend>훈련 글씨 크기</legend>
      <label>문제 · 선택지 · 지시문 <select name="textSize">${[["normal","보통"],["large","크게"],["extra","아주 크게"]]
        .map(([value,label]) => `<option value="${value}" ${draft.textSize === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <p class="muted">브라우저의 사이트 데이터를 삭제하면 설정, 훈련 기록, 이어서 할 내용이 지워질 수 있어요.</p>
    </fieldset><button>설정 저장</button><p id="feedback" role="status"></p></form></section>`;
  refreshVoices();
  const target = main.querySelector(focus ?? "h1") ?? main.querySelector("#add-training");
  const details = target.closest("details");
  if (details && !target.matches("summary")) details.open = true;
  target.focus();
}

function refreshVoices() {
  const select = main.querySelector('[name="voiceId"]');
  if (!select) return;
  const voices = matchingVoices();
  select.replaceChildren(new Option("자동 선택 · 알려진 남성 음성 우선", ""));
  if (draft.voice.voiceId && !voices.some(voice => voiceId(voice) === draft.voice.voiceId)) {
    select.add(new Option("저장된 음성 · 현재 사용할 수 없음", draft.voice.voiceId));
  }
  voices.forEach(voice => select.add(new Option(voice.name, voiceId(voice))));
  select.value = draft.voice.voiceId;
  main.querySelector("#voice-availability").textContent = !voices.length ? "사용 가능한 한국어 음성이 없어요. 기기의 한국어 읽기 음성을 확인해 주세요."
    : voices.some(preferredMale) ? "미리 듣기로 원하는 목소리를 확인해 보세요."
      : "남성으로 확인되는 이름의 음성이 없어요. 목록의 음성은 미리 들어보고 고를 수 있어요.";
}

function previewVoice() {
  const status = main.querySelector("#preview-status");
  const voice = chosenVoice(draft.voice);
  stopAudio();
  if (!voice || typeof SpeechSynthesisUtterance !== "function") {
    status.textContent = "미리 들을 수 있는 한국어 음성이 없어요.";
    return;
  }
  const sample = new SpeechSynthesisUtterance("안녕하세요. 함께 걷는 재활입니다.");
  sample.voice = voice;
  sample.lang = voice.lang;
  sample.rate = draft.voice.rate;
  status.textContent = `${voice.name} 미리 듣기`;
  sample.onend = () => { status.textContent = ""; };
  sample.onerror = () => { status.textContent = "재생할 수 없어요. 다른 한국어 음성을 골라 보세요."; };
  speech.speak(sample);
}

function savedProgress() {
  const progress = load(progressKey, null, value => value && value.version === 1 &&
    !value.finished && Number.isFinite(value.started) && Array.isArray(value.queue) &&
    value.queue.length && value.queue.every(stage => byId[stage.id] && Array.isArray(stage.items) && stage.items.length) &&
    Number.isInteger(value.stage) && value.queue[value.stage]?.items[value.item] !== undefined &&
    Array.isArray(value.completed) && Array.isArray(value.attempts) && value.state);
  return progress && { ...progress, queue: progress.queue.map(stage => ({ ...stage, exercise: byId[stage.id] })) };
}

function checkpoint() {
  if (!session?.daily) return true;
  if (session.since != null) {
    const now = Date.now();
    session.elapsed += Math.max(0, now - session.since);
    session.since = now;
  }
  const { since, queue, ...progress } = session;
  const saved = save(progressKey, {
    ...progress, queue: queue.map(({ exercise, ...stage }) => stage)
  });
  const warning = main.querySelector("#progress-warning");
  if (warning) warning.textContent = saved ? "" : "진행 상황을 저장할 수 없어요.";
  return saved;
}

function currentCompleted() {
  return session.completed.some(item => item.stage === session.stage && item.item === session.item);
}

function completeProblem() {
  if (!currentCompleted()) session.completed.push({ stage: session.stage, item: session.item });
}

function leaveTraining() {
  const dialog = main.querySelector("#pause-training");
  checkpoint();
  dialogueMessage(dialog, "");
  dialog.showModal();
}

function dialogueMessage(dialog, message) {
  dialog.querySelector("[role=status]").textContent = message;
}

function exitMarkup() {
  return `${button("pause-training", "훈련 마치기", true)}
    <p id="progress-warning" role="status"></p>
    <dialog id="pause-training" aria-labelledby="pause-title">
      <h2 id="pause-title">오늘은 여기까지 할까요?</h2>
      <p>지금까지의 훈련이 저장돼요. 다음에 이어서 할 수 있어요.</p>
      <p role="status"></p>
      <div class="actions">${button("save-exit", "저장하고 나가기")}${button("keep-training", "계속 훈련하기", true)}</div>
    </dialog>`;
}

function records() {
  const history = load(recordsKey, []).filter(entry =>
    entry && typeof entry.date === "number" && Number.isFinite(entry.date) &&
    new Date(entry.date).getTime() === entry.date && Number.isInteger(entry.count) && entry.count > 0
  );
  show(`<section class="panel"><h1 tabindex="-1">훈련 기록</h1>
    <p class="muted">훈련을 하나 마칠 때마다 이 브라우저에 기록합니다.</p>
    ${history.length ? `<ul>${history.map(({ date, count, title }) => `<li>${new Date(date).toLocaleString("ko-KR")} · ${typeof title === "string" && title ? escapeHtml(title) + " 완료" : `${count}종 완료`}</li>`).join("")}</ul>
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
  const voice = chosenVoice(session.voice);
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
  return stage.exercise.kind === "review" ? item.question ?? byId[item.id].makeItems(item.level)[item.index] : item;
}

function reviewReference() {
  const { exercise, level, items } = session.queue[session.stage];
  if (exercise.kind === "review") return items[session.item];
  return { id: exercise.id, level, index: session.item % exercise.makeItems(level).length };
}

function markReview(tag, toggle = false) {
  const { id, level, index } = reviewReference();
  const list = load(reviewKey, []).filter(entry => entry && Array.isArray(entry.tags));
  const item = currentItem();
  const variable = id.startsWith("arithmetic-");
  const previous = list.find(entry => entry.id === id && entry.level === level && entry.index === index &&
    (!variable || JSON.stringify(entry.question) === JSON.stringify(item)));
  const tags = new Set(previous?.tags);
  if (toggle && tags.has(tag)) tags.delete(tag);
  else tags.add(tag);
  const remaining = list.filter(entry => entry !== previous);
  if (tags.size) remaining.unshift({ id, level, index, tags: [...tags], ...(variable ? { question: item } : {}) });
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

function choiceOrder(options) {
  return session.state.order ??= shuffled(options.map((_, index) => index));
}

function choices(options) {
  return `<div class="actions">${choiceOrder(options)
    .map(index => `<button type="button" class="choice" data-action="answer" data-index="${index}">${options[index]}</button>`).join("")}</div>`;
}

function puzzleMarkup(item) {
  session.tiles ??= [item[1], item[3], item[0], item[2]];
  session.selectedTile ??= null;
  return `<p>그림 두 칸을 눌러 자리를 바꿔 보세요.</p>
    <p>완성할 그림</p><div class="picture-grid prompt">${item.map(tile => `<span>${tile}</span>`).join("")}</div>
    <div class="picture-grid">${session.tiles.map((tile, index) => `<button type="button" data-action="tile"
      data-index="${index}" aria-pressed="${session.selectedTile === index}" aria-label="${index + 1}번 칸 ${tile}">${tile}</button>`).join("")}</div>`;
}

const directions = [["위", -1, 0], ["왼쪽", 0, -1], ["오른쪽", 0, 1], ["아래", 1, 0]];

function mazeMarkup(item) {
  session.position ??= [0, 0];
  const [row, column] = session.position;
  return `<p>화살표 버튼으로 파란 말을 도착점까지 옮기세요.</p>
    <div class="maze-grid" aria-hidden="true">${item.map((row, y) => [...row].map((cell, x) =>
      `<span data-maze="${y}-${x}" class="${cell === "#" ? "wall" : ""}">${y === row && x === column ? "🔵" : cell === "G" ? "🏁" : ""}</span>`).join("")).join("")}</div>
    <p id="maze-position" role="status">${row + 1}행 ${column + 1}열</p>
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
    checkpoint();
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
  else checkpoint();
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
  else checkpoint();
}

function oppositeInstruction(item) {
  if (item.mode === "say") return "반대말을 말하고 정답을 확인해 보세요.";
  if (item.mode === "write") return "반대말을 직접 써 보세요.";
  if (item.mode === "sentence") return `문장에서 ‘${item.target}’의 반대 표현을 골라 보세요.`;
  return "반대말을 찾아보세요.";
}

function oppositeCue(cue) {
  const person = '<circle cx="15" cy="10" r="4"/><path d="M15 14v17m-7-7 7-5 7 5m-7 7-6 14m6-14 7 14"/>';
  const door = '<path d="M36 43V6h23v37M32 43h31"/>';
  const box = '<path d="M19 28v17h26V28M16 28h32"/>';
  const bulb = '<path d="M26 37h12m-11 5h10M27 33c0-4-8-6-8-15a13 13 0 0 1 26 0c0 9-8 11-8 15Z"/>';
  const shirt = '<path d="m24 12-10 5-5 11 9 5 5-5v17h18V28l5 5 9-5-5-11-10-5c-4 6-12 6-16 0Z"/>';
  const plate = '<circle cx="32" cy="25" r="20"/><circle cx="32" cy="25" r="14"/>';
  const art = {
    "plate-clean": plate + '<path d="M54 6v8m-4-4h8"/>',
    "plate-dirty": plate + '<path d="m26 19 4 4m6 4 3 4m-15-2 3 2"/>',
    "door-open": door + '<path d="m36 7-14 5v32l14-2m-10-17h2"/>',
    "door-closed": door + '<path d="M36 7h19v36M49 26h2"/>',
    sit: '<path d="M33 25v13h-16m16-1v8m-16-8v8"/><circle cx="26" cy="12" r="4"/><path d="M26 16v13H15v14"/>',
    stand: '<g transform="translate(15 0)">' + person + '</g>',
    "put-in": box + '<circle cx="32" cy="7" r="4"/><path d="M32 13v12m-5-5 5 5 5-5"/>',
    "take-out": box + '<circle cx="32" cy="34" r="3"/><path d="M32 26V10m-5 5 5-5 5 5"/>',
    push: person + '<rect x="42" y="21" width="15" height="19"/><path d="M24 29h14m-5-5 5 5-5 5"/>',
    pull: person + '<rect x="42" y="21" width="15" height="19"/><path d="M39 29H25m5-5-5 5 5 5"/>',
    "light-on": bulb + '<path d="m11 11-5-3m5 13H5m48-10 5-3m-5 13h6"/>',
    "light-off": bulb + '<path d="m12 43 40-40"/>',
    wear: shirt + '<path d="M32 3v14m-5-5 5 5 5-5"/>',
    remove: shirt + '<path d="M32 17V3m-5 5 5-5 5 5"/>',
    enter: person + door + '<path d="M23 31h19m-5-5 5 5-5 5"/>',
    exit: person + door + '<path d="M43 31H24m5-5-5 5 5 5"/>'
  };
  return art[cue] ? `<svg viewBox="0 0 64 50" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${art[cue]}</svg>` : escapeHtml(cue);
}

function oppositeMarkup(item) {
  const picture = cue => item.mode === "picture" && cue ? `<span class="opposite-cue" aria-hidden="true">${oppositeCue(cue)}</span>` : "";
  let activity;
  if (item.mode === "say") activity = button("reveal-opposite", "정답 확인");
  else if (item.mode === "write") activity = `<form id="written"><label>반대말 <input name="response" required autocomplete="off" value="${escapeHtml(session.state.response ?? "")}"></label> <button>확인</button></form>`;
  else activity = `<div class="actions opposite-options">${choiceOrder(item.options).map(index => {
    const [word, cue] = item.options[index];
    return `<div class="opposite-option"><button type="button" class="choice" data-action="answer" data-index="${index}">${picture(cue)}<span>${word}</span></button>
      <button type="button" class="secondary" data-action="hear-option" data-index="${index}" aria-label="${word} 듣기">듣기</button></div>`;
  }).join("")}</div>`;
  return `<p>${oppositeInstruction(item)}</p><div class="prompt">${picture(item.picture)}${item.prompt}</div>
    ${audioControls("문제 듣기")}${activity}<div class="prompt opposite-result" id="opposite-result" hidden></div>`;
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
  const state = session.state;
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
          : `<label class="cell${edge}"><input inputmode="numeric" maxlength="1" pattern="[1-${size}]" required aria-label="${row + 1}행 ${column + 1}열" data-cell="${index}" value="${escapeHtml(state.cells?.[index] ?? "")}"></label>`;
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
  } else if (kind === "opposite") {
    html = oppositeMarkup(item);
  } else {
    const [prompt, ...options] = item;
    const displayed = kind === "blank" ? [...prompt].map(char => char === "□"
      ? '<span class="blank" aria-label="빈칸">&nbsp;</span>' : char).join("") : prompt;
    html = `${kind === "blank" ? "<p>빈칸에 들어갈 글자를 골라 주세요.</p>" : listening ? "<p>문제를 듣고 답해 보세요.</p>" : ""}
      <div class="prompt" id="question-prompt" ${listening && !state.revealPrompt ? "hidden" : ""}>${listening && !state.revealPrompt ? "" : displayed}</div>
      ${listening ? audioControls("문제 듣기") + button("show-listening", "문제를 글로 보기", true) : ""}
      ${writing ? `<form id="written"><label>답 입력 <input name="response" type="text" autocomplete="off" required value="${escapeHtml(state.response ?? "")}"></label>
          ${open ? "" : "<button>확인</button>"}</form>`
        : open ? "" : choices(options)}
      ${open ? `${button("hint", kind === "write-open" ? "예시 보기" : "힌트 / 예시 보기", true)}
        <p id="example" role="status" ${state.revealExample ? "" : "hidden"}>${escapeHtml(options[0])}</p>${audioControls("문제 듣기")}` : ""}
      ${kind === "blank" ? audioControls("완성된 말 다시 듣기", true) : ""}`;
  }
  const instruction = kind === "opposite" ? "" : `<div class="actions instruction-audio">${button("hear-instruction", "지시 듣기", true)}</div>
    ${html.includes('id="audio"') ? "" : '<p id="voice-hint" role="status"></p><p id="timer" role="timer"></p><button type="button" data-action="pause" hidden>일시정지</button>'}`;
  show(`<section class="panel exercise-screen size-${session.textSize}${kind === "blank" ? " blank-screen" : ""}"><p class="muted progress-line">${exercise.domain} 훈련 · ${session.stage + 1} / ${session.queue.length}종</p>
    <h1 tabindex="-1">${exercise.title}</h1>
    <p class="progress-line">${stageExercise.kind === "sudoku" ? "판" : "문제"} ${session.item + 1} / ${items.length}</p>
    <div class="exercise-content">${html}</div>${instruction}<p id="feedback" role="status">${state.wrong ? "한 번 더 생각해 보세요." : ""}</p>
    <div class="actions">
      <button type="button" data-action="next" class="forward-button" ${spoken || open ? "" : "hidden"}>${session.item + 1 === items.length ? "이 훈련 완료" : "다음 문제"} <span aria-hidden="true">→</span></button>
      ${session.daily ? exitMarkup() : '<a class="button secondary" href="#home">훈련 나가기</a>'}
    </div>
    <details class="review-controls"><summary>복습에 저장</summary><div class="actions">
      ${[["favorite", "즐겨찾기"], ["assigned", "보호자 지정"], ...(kind === "blank" || exercise.id === "words" ? [["hard", "어려웠던 낱말"]] : [])]
        .map(([tag, title]) => `<button type="button" class="secondary" data-action="mark-${tag}" aria-pressed="${tags.includes(tag)}">${title}</button>`).join("")}
    </div><p id="review-status" role="status"></p></details></section>`);
  if (state.answered) showAnswer(undefined, false);
  checkpoint();
}

function answer(correct, choice) {
  if (session.answered) return;
  const feedback = document.querySelector("#feedback");
  session.attempts.push({ stage: session.stage, item: session.item, correct,
    response: choice?.dataset.index ?? session.state.response ?? session.state.cells ?? null });
  if (!correct) {
    markReview("wrong");
    session.state.wrong = true;
    checkpoint();
    feedback.textContent = "한 번 더 생각해 보세요.";
    return;
  }
  session.answered = true;
  session.state.answered = true;
  session.state.wrong = false;
  completeProblem();
  checkpoint();
  showAnswer(choice);
}

function showAnswer(choice, play = true) {
  const feedback = document.querySelector("#feedback");
  if (currentExercise().kind === "blank") {
    const [prompt, solution] = currentItem();
    const blanks = [...main.querySelectorAll(".blank")];
    const origin = choice?.getBoundingClientRect();
    blanks.forEach((blank, index) => {
      const letter = document.createElement("span");
      letter.className = "arriving-letter";
      letter.textContent = solution[index];
      blank.replaceChildren(letter);
      blank.removeAttribute("aria-label");
      blank.classList.add("filled");
      if (origin && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const target = letter.getBoundingClientRect();
        letter.animate?.([
          { transform: `translate(${origin.left + origin.width / 2 - target.left - target.width / 2}px, ${origin.top + origin.height / 2 - target.top - target.height / 2}px)` },
          { transform: "translate(0, 0)" }
        ], { duration: 380, easing: "ease-out" });
      }
    });
    document.querySelector("#audio").hidden = false;
    document.querySelector('#audio [data-action="listen"]').hidden = false;
    if (play) speak(prompt.replace(/□+/g, solution));
    feedback.textContent = `맞았어요! ${prompt.replace(/□+/g, solution)}`;
  } else if (currentExercise().kind === "opposite") {
    const item = currentItem();
    const [solution] = item.options[0];
    const result = document.querySelector("#opposite-result");
    const pair = `${item.target ?? item.prompt} ↔ ${solution}`;
    result.textContent = pair;
    result.hidden = false;
    main.querySelector('.choice[data-index="0"]')?.classList.add("correct-choice");
    feedback.textContent = item.mode === "say" ? "내가 말한 답과 비교해 보세요." : "맞았어요!";
    if (play) speak(`${item.target ?? item.prompt}, ${solution}`);
  } else {
    feedback.textContent = "맞았어요!";
  }
  const next = document.querySelector('[data-action="next"]');
  next.hidden = false;
  if (play) next.focus();
  main.querySelectorAll('.choice, #sudoku input, #sudoku button, #written input, #written button, [data-action="tile"], [data-action="step"], [data-action="reveal-opposite"]').forEach(control => {
    control.disabled = true;
  });
}

function next() {
  stopAudio();
  stopTimer();
  completeProblem();
  session.recall = false;
  session.answered = false;
  session.state = {};
  delete session.tiles;
  delete session.selectedTile;
  delete session.position;
  session.item += 1;
  if (session.item < session.queue[session.stage].items.length) {
    question();
    return;
  }
  const { title } = session.queue[session.stage].exercise;
  const entry = { date: Date.now(), count: 1, title, id: `${session.id}:${session.stage}` };
  const history = load(recordsKey, []);
  const saved = history.some(item => item?.id === entry.id) || save(recordsKey, [entry, ...history]);
  if (!saved) session.recordFailures += 1;
  session.stage += 1;
  session.item = 0;
  if (session.stage < session.queue.length) {
    if (session.voice.rest) restScreen(saved);
    else question();
    return;
  }
  session.finished = true;
  checkpoint();
  session.since = null;
  show(`<section class="panel"><h1 tabindex="-1">훈련을 마쳤어요!</h1>
    <p>${session.stage}종 완료 · ${session.recordFailures ? `${session.recordFailures}개 훈련의 기록을 저장할 수 없었어요.` : "이 브라우저에 기록을 저장했어요."}</p>
    <div class="actions"><a class="button" href="#home">홈으로</a>
    <a class="button secondary" href="#records">훈련 기록</a></div></section>`);
}

function restScreen(saved = true) {
  session.resting = true;
  show(`<section class="panel"><h1 tabindex="-1">잠깐 쉬어 가요</h1>
    <p>다음 훈련은 ${currentExercise().title}입니다.</p>
    ${saved ? "" : '<p role="status">방금 마친 훈련을 기록에 저장할 수 없었어요.</p>'}
    <div id="timer" class="prompt" role="timer" aria-label="남은 휴식 시간"></div>
    <div class="actions">${button("pause", "일시정지", true)}
    <button type="button" class="forward-button" data-action="resume-training">다음 훈련 시작 <span aria-hidden="true">→</span></button>
    ${session.daily ? exitMarkup() : '<a class="button secondary" href="#home">훈련 나가기</a>'}</div></section>`);
  countdown(session.voice.rest, () => {
    document.querySelector("#timer").textContent = "휴식이 끝났어요.";
  });
  checkpoint();
}

function route() {
  checkpoint();
  stopTimer();
  stopAudio();
  session = undefined;
  const hash = location.hash.slice(1);
  const [page, id] = hash.split("/");
  if (page === "today" || page === "planned" || (page === "practice" && ids.includes(id))) {
    const { plan, voice, textSize } = configuration();
    const active = page === "today" && savedProgress();
    if (active) {
      session = { ...active, since: document.hidden ? null : Date.now() };
      if (session.resting) restScreen();
      else question();
      return;
    }
    if (page === "practice" && byId[id].levels.length > 1) {
      const exercise = byId[id];
      show(`<section class="panel"><h1 tabindex="-1">${exercise.title}</h1>
        <form id="practice" data-id="${id}"><label>난이도 <select name="level">${levels(exercise, 0)}</select></label>
        <button>훈련 시작</button></form><a class="training-link" href="#home">홈으로</a></section>`);
      return;
    }
    const rows = page === "today" ? plan : page === "planned" ? [plan[Number(id)]].filter(Boolean)
      : [{ ...defaultRow(id), count: byId[id].kind === "review" ? 50 : defaultRow(id).count }];
    start(rows, voice, page === "today", textSize);
  } else if (page === "settings") {
    draft = configuration();
    settings();
  } else if (page === "records") {
    records();
  } else if (page === "menu" && homeFolders.some(([key]) => key === id)) {
    menuPage(id);
  } else {
    home();
  }
}

function start(rows, voice, daily = false, textSize = configuration().textSize) {
  const queue = rows.map(prepareStage).filter(stage => stage.items.length);
  if (!queue.length) {
    show('<section class="panel"><h1 tabindex="-1">실행할 훈련이 없어요</h1><p>맞춤 목록에 훈련을 추가하거나 복습할 문제를 먼저 저장해 주세요.</p><a class="button" href="#home">홈으로</a></section>');
    return;
  }
  for (const stage of queue) {
    if (stage.exercise.kind === "review") {
      stage.items = stage.items.map(item => ({ ...item, question: item.question ?? byId[item.id].makeItems(item.level)[item.index] }));
    }
  }
  const started = Date.now();
  session = { version: 1, id: globalThis.crypto.randomUUID?.() ?? `${started}-${Math.random()}`, daily, started, elapsed: 0,
    since: document.hidden ? null : started, queue, voice, textSize, stage: 0, item: 0, state: {},
    completed: [], attempts: [], recall: false, recordFailures: 0, finished: false };
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
    case "preview-voice": previewVoice(); break;
    case "pause-training": leaveTraining(); break;
    case "keep-training": main.querySelector("#pause-training").close(); break;
    case "save-exit":
      if (checkpoint()) location.hash = "home";
      else dialogueMessage(main.querySelector("#pause-training"), "저장하지 못했어요. 현재 화면에서 훈련을 계속할 수 있어요.");
      break;
    case "new-training": {
      if (!window.confirm("기존 훈련의 이어서 할 내용을 지우고 새로운 훈련을 시작할까요? 완료 기록은 남아요.")) break;
      const current = configuration();
      if (current.plan.map(prepareStage).some(stage => stage.items.length)) {
        try {
          localStorage.removeItem(progressKey);
          location.hash = "today";
        } catch {
          control.textContent = "새로운 훈련을 시작할 수 없어요";
        }
      }
      break;
    }
    case "add": case "remove": case "up": case "down": editPlan(control); break;
    case "next": {
      const form = document.querySelector("#written");
      if (currentExercise().kind !== "write-open" || form.reportValidity()) next();
      break;
    }
    case "listen": {
      const item = currentItem();
      const { kind } = currentExercise();
      const line = kind === "opposite" ? `${oppositeInstruction(item)} ${item.prompt}`
        : kind === "repeat" ? item : kind === "blank" ? item[0].replace(/□+/g, item[1]) : item[0];
      speak(line, kind === "repeat");
      break;
    }
    case "hear-instruction": {
      const item = currentItem();
      const kind = currentExercise().kind;
      const guidance = main.querySelector(".exercise-content > p")?.textContent;
      const line = guidance ?? (kind.startsWith("write") ? `${item[0]}. 답을 입력하세요.`
        : kind === "open" ? item[0] : `${item[0]}. 알맞은 답을 골라 주세요.`);
      const audio = main.querySelector("#audio");
      if (kind === "blank" && audio.hidden) {
        audio.hidden = false;
        audio.querySelector('[data-action="listen"]').hidden = true;
      }
      speak(line);
      break;
    }
    case "hint": {
      const example = document.querySelector("#example");
      example.hidden = false;
      session.state.revealExample = true;
      markReview("hint");
      checkpoint();
      speak(currentItem()[1]);
      break;
    }
    case "show-listening": {
      const prompt = document.querySelector("#question-prompt");
      prompt.textContent = currentItem()[0];
      prompt.hidden = false;
      session.state.revealPrompt = true;
      markReview("hint");
      checkpoint();
      break;
    }
    case "mark-favorite": case "mark-assigned": case "mark-hard":
      markReview(control.dataset.action.slice(5), true);
      break;
    case "hide-picture": session.recall = true; question(); break;
    case "tile": movePuzzle(control); break;
    case "step": moveMaze(control); break;
    case "answer": answer(control.dataset.index === "0", control); break;
    case "resume-training": stopTimer(); session.resting = false; question(); break;
    case "hear-option": speak(currentItem().options[Number(control.dataset.index)][0]); break;
    case "reveal-opposite":
      session.answered = true; session.state.answered = true; completeProblem(); checkpoint(); showAnswer();
      break;
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
  if (session && field.dataset.cell != null) {
    (session.state.cells ??= {})[field.dataset.cell] = field.value;
    checkpoint();
  }
  if (session && field.form?.id === "written") {
    session.state.response = field.value;
    checkpoint();
  }
  if (field.form?.id !== "settings" || !field.name || !field.validity.valid) return;
  const row = field.closest("[data-row]");
  if (row) {
    const training = draft.plan[Number(row.dataset.row)];
    training[field.name] = Number(field.value);
    row.querySelector("[data-level-label]").textContent = byId[training.id].levels[training.level];
    row.querySelector("[data-count-label]").textContent = training.count;
    document.querySelector("#total").textContent = totals(draft.plan.map(prepareStage));
  } else if (field.name === "voiceId") {
    draft.voice.voiceId = field.value;
  } else if (field.name === "textSize") {
    draft.textSize = field.value;
  } else {
    draft.voice[field.name] = Number(field.value);
  }
  persistSettings();
});

main.addEventListener("invalid", event => {
  const details = event.target.form?.id === "settings" && event.target.closest("details");
  if (details) details.open = true;
}, true);

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
      const item = currentItem();
      const solution = currentExercise().kind === "opposite" ? item.options[0][0] : item[1];
      answer(response === solution.normalize());
    }
  } else if (form.id === "sudoku") {
    const solution = currentItem().solution;
    answer([...form.querySelectorAll("input")].every(input => Number(input.value) === solution[input.dataset.cell]));
  }
});

window.addEventListener("hashchange", route);
window.addEventListener("pagehide", () => {
  checkpoint();
  if (session) session.since = null;
  stopTimer();
  stopAudio();
});
speech?.addEventListener("voiceschanged", refreshVoices);
document.addEventListener("visibilitychange", () => {
  if (!session?.daily || session.finished) return;
  if (document.hidden) {
    checkpoint();
    session.since = null;
  } else {
    session.since = Date.now();
  }
});
setInterval(() => {
  if (session?.daily && !session.finished && session.since != null) checkpoint();
}, 10000);
window.addEventListener("pageshow", event => {
  if (event.persisted) route();
});
route();
