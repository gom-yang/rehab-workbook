"use strict";

const main = document.querySelector("#main");
const speech = window.speechSynthesis;
const ids = exercises.map(({ id }) => id);
const byId = Object.fromEntries(exercises.map(exercise => [exercise.id, exercise]));
const matchingVoices = () => (speech?.getVoices() ?? []).filter(voice => /^ko\b/i.test(voice.lang));
const settingsKey = "rehab-workbook.selected.v1";
const recordsKey = "rehab-workbook.records.v1";
let session;
let timer;
let audioRun = 0;

function load(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : fallback;
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

function selected() {
  const saved = load(settingsKey, ids);
  const usable = ids.filter(id => saved.includes(id));
  return usable.length ? usable : ids;
}

function show(html) {
  main.innerHTML = html;
  main.querySelector("h1")?.focus();
}

function button(action, label, secondary = false) {
  return `<button type="button" data-action="${action}" class="${secondary ? "secondary" : ""}">${label}</button>`;
}

function home() {
  const plan = selected().map(id => byId[id]);
  const count = plan.reduce((total, exercise) => total + (exercise.id === "sudoku" ? 0 : exercise.items.length), 0);
  const board = plan.some(({ id }) => id === "sudoku");
  const menuMarkup = menus.map(({ title, groups }) => `
    <section class="tile"><h2>${title}</h2>
      ${groups.map(([group, ...items]) => `<details><summary>${group}</summary><ul>
        ${items.map(item => byId[item]
          ? `<li><a href="#practice/${item}">${byId[item].title}</a></li>`
          : `<li>${item}<span class="badge">준비 중</span></li>`).join("")}
      </ul></details>`).join("")}
    </section>`).join("");
  show(`
    <section class="hero"><p class="eyebrow" lang="en">REHAB WORKBOOK</p>
      <h1 tabindex="-1">함께 걷는 재활</h1><p>오늘도 우리만의 속도로</p>
      <a class="button" href="#today">오늘의 훈련 시작</a>
      <p class="muted">보호자가 설정한 맞춤 훈련 · ${[count && `${count}문제`, board && "스도쿠 1판"].filter(Boolean).join(" + ")}</p>
    </section>
    <section class="tile"><h2>맞춤 훈련 골라서 시작하기</h2><div class="actions">
      ${exercises.map(exercise => `<a class="button secondary" href="#practice/${exercise.id}">${exercise.title} · ${exercise.items.length}${exercise.id === "sudoku" ? "판" : "문제"}</a>`).join("")}
    </div></section>
    <h2 style="margin-top:1.5rem">전체 훈련 메뉴</h2>
    <p class="muted">언어·인지 영역의 세부 목차는 임시 구성입니다.</p>
    <div class="grid">${menuMarkup}
      <section class="tile"><h2>생활 대화 <span class="badge">준비 중</span></h2></section>
      <section class="tile"><h2>복습 <span class="badge">준비 중</span></h2></section>
    </div>`);
}

function settings() {
  const current = selected();
  show(`<section class="panel"><h1 tabindex="-1">보호자 설정</h1>
    <p>오늘의 훈련에 넣을 항목을 골라 주세요.</p>
    <form id="settings"><fieldset><legend>맞춤 훈련</legend>
      ${exercises.map(({ id, title }) => `<label><input type="checkbox" name="training" value="${id}" ${current.includes(id) ? "checked" : ""}> ${title}</label>`).join("")}
    </fieldset><p>음성 0.5배 · 2회 반복 · 따라 말하기 10초 대기 · 훈련 종류 사이 60초 휴식</p>
    <button>설정 저장</button><p id="feedback" role="status"></p></form></section>`);
}

function records() {
  const history = load(recordsKey, []).filter(entry =>
    entry && typeof entry.date === "number" && Number.isFinite(entry.date) &&
    new Date(entry.date).getTime() === entry.date && Number.isInteger(entry.count) && entry.count > 0 && entry.count <= ids.length
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

function speak(text) {
  stopTimer();
  stopAudio();
  const run = audioRun;
  const output = document.querySelector("#timer");
  const toggle = document.querySelector('[data-action="pause"]');
  const voice = matchingVoices().find(option => option.localService);
  function waitToSpeak(message) {
    const hint = document.querySelector("#voice-hint");
    hint.textContent = message;
    countdown(timing.wait, () => {
      output.textContent = "준비되면 다음 문제를 눌러 주세요.";
    });
  }
  if (!voice || typeof SpeechSynthesisUtterance !== "function") {
    waitToSpeak("기기에서 한국어 음성을 찾을 수 없어요. 화면의 글을 보고 말해 보세요.");
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
    utterance.rate = timing.rate;
    output.textContent = `듣기 ${played} / ${timing.repeats}`;
    utterance.onend = () => {
      if (run !== audioRun) return;
      if (played < timing.repeats) {
        play();
      } else {
        waitToSpeak("이제 천천히 따라 말해 보세요.");
      }
    };
    utterance.onerror = () => {
      if (run === audioRun) waitToSpeak("음성을 재생할 수 없어요. 화면의 글을 보고 말해 보세요.");
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
  return byId[session.queue[session.stage]];
}

function currentItem() {
  return currentExercise().items[session.item];
}

function choices(options) {
  return `<div class="actions">${shuffled(options.map((label, index) => ({ label, index })))
    .map(({ label, index }) => `<button type="button" class="choice" data-action="answer" data-index="${index}">${label}</button>`).join("")}</div>`;
}

function question() {
  const exercise = currentExercise();
  const item = currentItem();
  const spoken = exercise.id === "words" || exercise.id === "phrases";
  let html;
  if (spoken) {
    html = `<p>음성을 듣고 따라 말해 보세요.</p><div class="prompt">${item}</div>
      <p id="voice-hint" role="status">음성을 들으려면 듣기 버튼을 눌러 주세요.</p>
      <p id="timer" role="timer" aria-label="음성 및 대기 시간"></p>
      <div class="actions">${button("listen", "듣기 / 다시 듣기")}<button type="button" class="secondary" data-action="pause" hidden>일시정지</button></div>`;
  } else if (exercise.id === "sudoku") {
    html = `<p>가로줄, 세로줄, 굵은 선으로 나뉜 2×2 칸마다 1부터 4까지 한 번씩 넣으세요.</p>
      <form id="sudoku"><div class="sudoku">${item.clues.map((value, index) => value
        ? `<span class="cell given">${value}</span>`
        : `<label class="cell"><input inputmode="numeric" maxlength="1" pattern="[1-4]" required aria-label="${Math.floor(index / 4) + 1}행 ${index % 4 + 1}열" data-cell="${index}"></label>`).join("")}</div>
      <button>확인</button></form>`;
  } else if (exercise.id === "memory") {
    html = session.recall
      ? `<p>아까 본 그림을 골라 주세요.</p>${choices(item)}`
      : `<p>그림을 기억해 주세요. 준비되면 그림을 가립니다.</p>
         <div class="prompt">${item[0]}</div>${button("hide-picture", "그림 가리기")}`;
  } else {
    const [prompt, ...options] = item;
    html = `<p>${exercise.id === "math" ? "암산한 답을 골라 주세요." : "네모에 들어갈 글자를 골라 주세요."}</p>
      <div class="prompt">${prompt}</div>${choices(options)}`;
  }
  show(`<section class="panel"><p class="muted">${exercise.domain} 훈련 · ${session.stage + 1} / ${session.queue.length}종</p>
    <h1 tabindex="-1">${exercise.title}</h1>
    <p>${exercise.id === "sudoku" ? "판" : "문제"} ${session.item + 1} / ${exercise.items.length}</p>
    ${html}<p id="feedback" role="status"></p>
    <div class="actions">
      <button type="button" data-action="next" ${spoken ? "" : "hidden"}>${session.item + 1 === exercise.items.length ? "훈련 마치기" : "다음 문제"}</button>
      <a class="button secondary" href="#home">훈련 나가기</a>
    </div></section>`);
}

function answer(correct) {
  const feedback = document.querySelector("#feedback");
  if (!correct) {
    feedback.textContent = "한 번 더 생각해 보세요.";
    return;
  }
  feedback.textContent = "맞았어요!";
  const next = document.querySelector('[data-action="next"]');
  next.hidden = false;
  next.focus();
  main.querySelectorAll(".choice, #sudoku input, #sudoku button").forEach(control => {
    control.disabled = true;
  });
}

function next() {
  stopAudio();
  stopTimer();
  session.recall = false;
  session.item += 1;
  if (session.item < currentExercise().items.length) {
    question();
    return;
  }
  session.stage += 1;
  session.item = 0;
  if (session.stage < session.queue.length) {
    show(`<section class="panel"><h1 tabindex="-1">잠깐 쉬어 가요</h1>
      <p>다음 훈련은 ${currentExercise().title}입니다.</p>
      <div id="timer" class="prompt" role="timer" aria-label="남은 휴식 시간"></div>
      <div class="actions">${button("pause", "일시정지", true)}
      <button type="button" data-action="resume-training" disabled>다음 훈련 시작</button>
      <a class="button secondary" href="#home">훈련 나가기</a></div></section>`);
    countdown(timing.rest, () => {
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
  if (page === "today" || (page === "practice" && ids.includes(id))) {
    session = { queue: page === "today" ? selected() : [id], stage: 0, item: 0, recall: false };
    question();
  } else if (page === "settings") {
    settings();
  } else if (page === "records") {
    records();
  } else {
    home();
  }
}

main.addEventListener("click", event => {
  const control = event.target.closest("button[data-action]");
  if (!control) return;
  switch (control.dataset.action) {
    case "next": next(); break;
    case "listen": speak(currentItem()); break;
    case "hide-picture": session.recall = true; question(); break;
    case "answer": answer(control.dataset.index === "0"); break;
    case "resume-training": question(); break;
    case "clear-records":
      if (window.confirm("이 브라우저의 훈련 기록을 모두 지울까요?")) {
        if (save(recordsKey, [])) records();
        else document.querySelector("#feedback").textContent = "기록을 지울 수 없었어요.";
      }
      break;
  }
});

main.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "settings") {
    const chosen = new FormData(form).getAll("training");
    const feedback = document.querySelector("#feedback");
    feedback.textContent = chosen.length
      ? (save(settingsKey, chosen) ? "이 브라우저에 설정을 저장했어요." : "설정을 저장할 수 없었어요.")
      : "훈련을 하나 이상 골라 주세요.";
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
