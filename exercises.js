"use strict";

const timing = Object.freeze({ rate: 0.5, repeats: 2, wait: 10, rest: 60 });

const exercises = [
  { id: "words", title: "단어 따라 말하기", domain: "언어", items: [
    "사과", "우산", "모자", "바다", "시계", "나무", "신발", "연필", "버스", "고양이"
  ] },
  { id: "phrases", title: "어구 따라 말하기", domain: "언어", items: [
    "따뜻한 물", "파란 하늘", "작은 가방", "새 신발", "하얀 구름",
    "동네 공원", "아침 식사", "깨끗한 수건", "좋은 날씨", "달콤한 사과"
  ] },
  { id: "complete", title: "낱말 완성하기", domain: "언어", items: [
    ["사□", "과", "툭", "쩍"], ["우□", "산", "깡", "릎"], ["연□", "필", "깡", "릎"],
    ["바□", "다", "쩍", "툭"], ["시□", "계", "걱", "깡"], ["수□", "건", "솜", "쩍"],
    ["신□", "발", "늘", "솜"], ["고양□", "이", "자", "오"], ["냉장□", "고", "미", "바"],
    ["자전□", "거", "노", "파"]
  ] },
  { id: "sudoku", title: "스도쿠", domain: "인지", items: [
    { clues: [1,0,0,4, 0,4,1,0, 2,0,4,0, 0,3,0,1],
      solution: [1,2,3,4, 3,4,1,2, 2,1,4,3, 4,3,2,1] }
  ] },
  { id: "math", title: "암산", domain: "인지", items: [
    ["2 + 3", "5", "4", "6"], ["7 − 2", "5", "9", "4"], ["4 + 4", "8", "7", "9"],
    ["9 − 3", "6", "5", "7"], ["6 + 2", "8", "6", "7"], ["8 − 4", "4", "3", "5"],
    ["3 + 6", "9", "8", "7"], ["10 − 2", "8", "6", "9"], ["5 + 6", "11", "10", "12"],
    ["12 − 5", "7", "6", "8"]
  ] },
  { id: "memory", title: "그림 기억하기", domain: "인지", items: [
    ["🍎 사과", "🍐 배", "🍌 바나나"],
    ["☂️ 우산", "🎩 모자", "🧤 장갑"],
    ["🚌 버스", "🚲 자전거", "🚗 자동차"],
    ["🐈 고양이", "🐕 강아지", "🐇 토끼"],
    ["🍇 포도", "🍓 딸기", "🍉 수박"]
  ] }
];
const defaultIds = exercises.map(({ id }) => id);

function sudokuBoards(level) {
  const size = [4, 6, 9, 9, 9][level];
  const boxWidth = [2, 3, 3, 3, 3][level];
  const boxHeight = size / boxWidth;
  const keep = [9, 23, 55, 48, 42][level];
  function countSolutions(grid, limit = 2) {
    let target = -1;
    let possible = [];
    for (let index = 0; index < grid.length; index += 1) {
      if (grid[index]) continue;
      const row = Math.floor(index / size);
      const column = index % size;
      const used = new Set();
      for (let offset = 0; offset < size; offset += 1) {
        used.add(grid[row * size + offset]);
        used.add(grid[offset * size + column]);
        const boxRow = row - row % boxHeight + Math.floor(offset / boxWidth);
        const boxColumn = column - column % boxWidth + offset % boxWidth;
        used.add(grid[boxRow * size + boxColumn]);
      }
      const available = Array.from({ length: size }, (_, n) => n + 1).filter(n => !used.has(n));
      if (!available.length) return 0;
      if (target < 0 || available.length < possible.length) {
        target = index;
        possible = available;
      }
    }
    if (target < 0) return 1;
    let total = 0;
    for (const value of possible) {
      grid[target] = value;
      total += countSolutions(grid, limit - total);
      if (total >= limit) break;
    }
    grid[target] = 0;
    return total;
  }
  return Array.from({ length: 5 }, (_, variant) => {
    const solution = Array.from({ length: size * size }, (_, index) => {
      const row = Math.floor(index / size);
      return (row * boxWidth + Math.floor(row / boxHeight) + index % size + variant) % size + 1;
    });
    const clues = [...solution];
    for (let offset = 0, left = clues.length; offset < clues.length && left > keep; offset += 1) {
      const index = (offset * (size + 1) + variant * 7) % clues.length;
      clues[index] = 0;
      if (countSolutions(clues) === 1) left -= 1;
      else clues[index] = solution[index];
    }
    return { clues, solution };
  });
}

const sudokuLevels = [0, 1, 2, 3, 4].map(sudokuBoards);
sudokuLevels[0][0] = exercises.find(({ id }) => id === "sudoku").items[0];

for (const exercise of exercises) {
  const { id, items } = exercise;
  exercise.kind = { words: "repeat", phrases: "repeat", complete: "blank",
    sudoku: "sudoku", math: "quiz", memory: "memory" }[id];
  exercise.levels = { words: ["초급", "한 음절", "두 음절", "세 음절", "긴 단어"],
    phrases: ["기초", "명사 + 명사", "꾸며주는 말 + 명사", "명사 + 동사"],
    complete: ["마지막 글자", "첫 글자", "중간 글자", "두 글자"],
    sudoku: ["4×4", "6×6", "9×9 초급", "9×9 중급", "9×9 고급"],
    math: ["두 자리", "한 자리", "세 자리", "혼합", "기존 문제"],
    memory: ["그림 4개", "그림 2개", "그림 3개", "그림 6개", "그림 1개"]
  }[id];
  exercise.makeItems = level => {
    if (id === "words") return [items, ["물", "꽃", "책", "손", "눈"],
      [...items.filter(word => word.length === 2), "수건"], ["자동차", "냉장고", "물고기", "자전거"], ["해바라기", "엘리베이터", "소방자동차"]][level];
    if (id === "phrases") return [items, ["사과 주스", "버스 정류장", "바다 사진"],
      ["빨간 사과", "따뜻한 물", "작은 가방"], ["물 마시기", "양말 신기", "창문 열기", "가방 들기", "공원 걷기"]][level];
    if (id === "complete") {
      if (!level) return items;
      const source = level === 1 ? items.map(([prompt, answer]) => prompt.replace("□", answer))
        : ["고양이", "자동차", "냉장고", "자전거", "해바라기", "물고기", "강아지", "우체국", "목도리", "선풍기"];
      return source.map(word => {
        const start = level === 1 ? 0 : 1;
        const length = level === 3 ? 2 : 1;
        return [word.slice(0, start) + "□".repeat(length) + word.slice(start + length),
          word.slice(start, start + length), ...(length === 1 ? ["툭", "쩍"] : ["툭툭", "쩍쩍"])];
      });
    }
    if (id === "math") {
      if (level === 4) return items;
      return items.map((_, index) => {
        const base = [24 + index, 4 + index % 6, 240 + index * 7, 6 + index * 19][level];
        const offset = [10, 1, 100, 1][level] + index % 4;
        const subtract = index % 2;
        const answer = subtract ? base - offset : base + offset;
        return [`${base} ${subtract ? "−" : "+"} ${offset}`, String(answer), String(answer + 1), String(answer - 1)];
      });
    }
    if (id === "memory") {
      if (level === 4) return items.map(item => [item[0], ...item]);
      const pictures = items.flat();
      const size = [4, 2, 3, 6][level];
      return items.map((_, index) => {
        const rotated = pictures.slice(index * 3).concat(pictures.slice(0, index * 3));
        return [rotated.slice(0, size).slice().reverse().join(" · "), rotated[0], ...rotated.slice(size, size + 3)];
      });
    }
    return sudokuLevels[level];
  };
}

// Each choice question stores the correct choice first. The player shuffles choices.
function training(id, title, kind, ...items) {
  return { id, title, kind, items, levels: ["기초"], makeItems: () => items };
}

function leveled(id, title, kind, stages) {
  return { id, title, kind, levels: stages.map(([label]) => label), makeItems: level => stages[level].slice(1) };
}

const menus = [
  { title: "언어 훈련", groups: [
    ["말하기", "words", "phrases",
      leveled("sentences", "문장 따라 말하기", "repeat", [
        ["두 어절", "물을 마셔요.", "버스를 타요."],
        ["세 어절", "차가운 물을 마셔요.", "아침에 공원을 걸어요."],
        ["네 어절", "아침에 차가운 물을 마셔요.", "동생과 공원에서 사진을 찍어요."],
        ["긴 문장", "오늘 아침에 동생과 공원에 가서 사진을 찍었어요."],
        ["일상 대화", "어서 오세요. 무엇을 도와드릴까요?", "따뜻한 차 한 잔 주세요. 고맙습니다."]
      ]),
      training("expand", "단계별 문장 확장", "repeat", "물", "차가운 물", "물을 마셔요.", "차가운 물을 마셔요.", "아침에 차가운 물을 마셔요."),
      training("name", "그림 이름대기", "open", ["🍎 이름을 말해 보세요.", "사로 시작해요. 사과"], ["☂️ 이름을 말해 보세요.", "우로 시작해요. 우산"]),
      training("describe", "그림 보고 문장 말하기", "open", ["🐕 🏃 어떤 일이 일어나고 있나요?", "강아지가 달려요."]),
      training("category", "범주별 단어 말하기", "open", ["과일을 두 가지 말해 보세요.", "예시: 사과, 바나나"]),
      training("opposites", "반대말·유의어 말하기", "open", ["‘크다’의 반대말을 말해 보세요.", "작다"], ["‘기쁘다’와 비슷한 말을 말해 보세요.", "즐겁다"]),
      training("respond", "질문에 대답하기", "open", ["오늘 아침에 무엇을 먹었나요?", "예시: 밥과 달걀을 먹었어요."])],
    ["듣기",
      training("listen-picture", "듣고 그림 찾기", "listen", ["사과", "🍎", "🚌", "🧤"], ["우산", "☂️", "🍇", "🐈"]),
      training("listen-action", "듣고 행동 찾기", "listen", ["물 마시기", "🥤 마시기", "🚶 걷기", "📖 읽기"]),
      training("listen-meaning", "단어·어구·문장 이해", "listen", ["빨간 사과", "🍎", "🍏", "🍌"], ["고양이가 잠을 자요.", "잠자는 고양이", "달리는 고양이", "밥 먹는 고양이"]),
      training("listen-instruction", "지시 듣고 수행하기", "listen", ["별을 먼저 누르세요.", "★", "●", "■"]),
      training("listen-story", "짧은 이야기 듣고 대답하기", "listen", ["민수는 마트에서 우유를 샀어요. 무엇을 샀나요?", "우유", "사과", "두부"])],
    ["읽기",
      training("letters", "자음·모음 익히기", "quiz", ["‘가’의 첫 자음을 고르세요.", "ㄱ", "ㄴ", "ㄷ"], ["‘나’의 모음을 고르세요.", "ㅏ", "ㅗ", "ㅜ"]),
      training("read", "글자·단어·어구·문장 읽기", "open", ...["물", "사과", "빨간 사과", "빨간 사과를 먹어요."].map(value => [value, value])),
      training("match-word", "단어와 그림 연결", "quiz", ["우산", "☂️", "🚌", "🧤"], ["고양이", "🐈", "🐇", "🐕"]),
      training("match-sentence", "문장과 그림 연결", "quiz", ["버스를 타요.", "🚌", "🚲", "🚆"]),
      training("read-meaning", "읽고 내용 이해", "quiz", ["지우가 아침에 우유를 마셨어요. 언제 마셨나요?", "아침", "점심", "저녁"])],
    ["쓰기", "complete",
      training("letter-order", "글자 순서 맞추기", "quiz", ["🍎 올바른 글자 순서를 골라 주세요.", "사 → 과", "과 → 사", "과 → 과"]),
      training("dictation", "듣고 낱말 만들기", "write-listen", ["우산", "우산"], ["가방", "가방"]),
      training("write-opposite", "반대말 쓰기", "write", ["‘크다’의 반대말", "작다"], ["‘길다’의 반대말", "짧다"]),
      training("copy", "글자 따라 쓰기", "write", ["보고 입력해 보세요. ‘물’", "물"], ["보고 입력해 보세요. ‘책’", "책"]),
      training("write-picture", "그림 보고 직접 쓰기", "write", ["🍎", "사과"], ["☂️", "우산"]),
      training("sentence-blank", "문장 빈칸 완성", "blank", ["비가 와서 □□을 써요.", "우산", "신발", "가방"]),
      training("write-sentence", "문장 쓰기", "write-open", ["아침에 한 일을 한 문장으로 적어 보세요.", "예시: 아침에 물을 마셨어요."]),
      "손가락·터치펜 손글씨"]
  ] },
  { title: "인지 훈련", groups: [
    ["기억력", "memory",
      leveled("memory-number", "숫자 기억", "memory", [
        ["2자리", ["3 8", "38", "83", "36"]],
        ["3자리", ["4 7 2", "472", "427", "742"]],
        ["4자리", ["5 2 8 1", "5281", "5218", "5821"]],
        ["5자리", ["6 3 7 2 9", "63729", "63279", "63792"]]
      ]),
      training("memory-word", "단어 기억", "memory", ["우산 · 수건", "우산", "연필", "신발"]),
      training("memory-place", "위치 기억", "memory", ["●  □  □", "왼쪽", "가운데", "오른쪽"]),
      training("memory-order", "순서 기억", "memory", ["🍎 → 🍌 → 🍇", "🍎 → 🍌 → 🍇", "🍌 → 🍎 → 🍇", "🍇 → 🍎 → 🍌"])],
    ["주의집중력",
      training("same-picture", "같은 그림 찾기", "quiz", ["🐈와 같은 그림", "🐈", "🐕", "🐇"]),
      training("different-picture", "다른 그림 찾기", "quiz", ["🍎 🍎 🍌 🍎 중 다른 그림", "🍌", "🍎"]),
      training("target-symbol", "특정 숫자·글자 찾기", "quiz", ["‘7’이 있는 줄을 고르세요.", "3 7 4", "3 1 4", "3 2 4"], ["‘가’가 있는 줄을 고르세요.", "나 가 다", "나 라 다", "나 마 다"]),
      training("same-shape", "같은 도형 찾기", "quiz", ["▲와 같은 도형", "▲", "●", "■"]),
      training("missing-part", "빠진 부분 찾기", "quiz", ["신발 한 짝만 있어요. 무엇이 더 필요한가요?", "나머지 신발", "모자", "우산"])],
    ["계산력", "math",
      training("compare", "숫자 크기 비교", "quiz", ["더 큰 수를 고르세요.", "24", "18", "13"]),
      training("operations", "사칙연산·혼합 계산", "quiz", ["13 + 8", "21", "20", "22"], ["19 − 7", "12", "11", "13"], ["4 × 3", "12", "7", "16"], ["15 ÷ 3", "5", "3", "6"], ["2 + 3 × 4", "14", "20", "10"]),
      leveled("money", "돈 계산·거스름돈", "quiz", [
        ["동전", ["500원 동전 2개는 얼마인가요?", "1,000원", "500원", "2,000원"]],
        ["지폐", ["1,000원 지폐 3장은 얼마인가요?", "3,000원", "2,000원", "4,000원"]],
        ["합산", ["1,000원 지폐 1장과 500원 동전 3개는 얼마인가요?", "2,500원", "1,500원", "4,000원"]],
        ["거스름돈", ["5,000원으로 3,000원 물건을 사면?", "2,000원", "3,000원", "1,000원"]]
      ])],
    ["논리적 사고 / 추론", "sudoku",
      leveled("patterns", "숫자·그림 규칙", "quiz", [
        ["색상", ["🔵 🟡 🔵 🟡 □", "🔵", "🟡", "🔴"]],
        ["도형", ["● ▲ ▲ ● ▲ □", "▲", "●", "■"]],
        ["숫자", ["2, 4, 6, □", "8", "7", "10"]],
        ["복합", ["●1 ▲2 ●3 ▲4 □", "●5", "▲5", "●4"]]
      ]),
      training("related", "공통점·관련 있는 것 찾기", "quiz", ["사과와 바나나의 공통점은?", "과일", "가구", "옷"], ["열쇠와 관련 있는 물건은?", "자물쇠", "수건", "연필"]),
      training("classify", "분류", "quiz", ["옷에 속하는 것을 고르세요.", "바지", "접시", "바나나"])],
    ["시공간 능력",
      training("shapes", "도형 맞추기", "quiz", ["변이 세 개인 도형", "▲", "■", "●"]),
      training("direction", "방향 구별", "quiz", ["오른쪽을 가리키는 화살표", "→", "←", "↑"]),
      training("position", "위치 찾기", "quiz", ["□  ●  □ — 동그라미는 어디에 있나요?", "가운데", "왼쪽", "오른쪽"]),
      training("rotation", "회전 도형", "quiz", ["↑를 오른쪽으로 90도 돌리면?", "→", "←", "↓"]),
      training("picture-puzzle", "그림 퍼즐", "puzzle", ["🌤️", "☁️", "🌳", "🏠"]),
      training("maze", "미로", "maze", ["..#.", "#.#.", "...G", ".##."])],
    ["시간·지남력",
      leveled("clock", "시계 읽기·시간 계산", "quiz", [
        ["정각", ["🕒", "3시", "6시", "9시"]],
        ["30분", ["🕟", "4시 30분", "5시 30분", "4시"]],
        ["5분", ["짧은 바늘은 2를 조금 지났고 긴 바늘은 1을 가리켜요.", "2시 5분", "2시 10분", "1시 10분"]],
        ["시간 계산", ["2시에서 한 시간 뒤는?", "3시", "1시", "4시"]]
      ]),
      training("calendar", "날짜·요일·달력·계절", "quiz", ["화요일 다음 날은?", "수요일", "월요일", "목요일"], ["4월 다음 달은?", "5월", "3월", "6월"], ["봄 다음 계절은?", "여름", "겨울", "가을"]),
      { ...training("today-date", "오늘 날짜", "open", ["오늘은 몇 월 며칠인가요?", ""]), makeItems: () => [
        ["오늘은 몇 월 며칠인가요?", new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date())]
      ] },
      training("current-place", "현재 장소 말하기", "open", ["지금 어디에 있나요?", "주변을 살펴보고 장소를 말해 보세요."])],
    ["계획·순서 / 집행 기능",
      training("sort-sequence", "숫자·그림 순서 배열", "quiz", ["작은 수부터 바르게 배열한 것은?", "2 → 5 → 8", "5 → 2 → 8", "8 → 5 → 2"], ["꽃이 피는 순서는?", "🌰 → 🌱 → 🌷", "🌷 → 🌱 → 🌰", "🌱 → 🌷 → 🌰"]),
      training("daily-order", "일상 행동 순서·하루 일정", "quiz", ["손을 씻는 순서는?", "적시기 → 비누칠 → 헹구기", "비누칠 → 헹구기 → 적시기", "헹구기 → 적시기 → 비누칠"],
        ["오전 9시 병원, 오후 1시 점심. 먼저 할 일은?", "병원 가기", "점심 먹기"]),
      training("prepare", "필요한 물건 선택·조건별 분류", "quiz", ["비가 올 때 필요한 물건은?", "우산", "선풍기", "수저"], ["냉장 보관할 것을 골라 주세요.", "우유", "신문", "수건"])],
    ["상황 판단 / 문제 해결",
      training("situations", "적절한 행동·위험 구별", "quiz", ["보행 신호가 빨간불이에요. 어떻게 할까요?", "기다려요.", "바로 건너요.", "뛰어가요."], ["바닥에 물이 쏟아졌어요.", "미끄러지지 않게 닦아요.", "그 위에서 뛰어요.", "그대로 두고 뛰어가요."]),
      training("purpose", "일상 문제 해결·물건 용도·원인과 결과", "quiz", ["글씨를 쓸 때 쓰는 물건은?", "연필", "우산", "접시"], ["방이 어두워요. 어떻게 할까요?", "불을 켜요.", "창문을 닫아요.", "신발을 신어요."], ["얼음을 따뜻한 곳에 두면?", "녹아요.", "커져요.", "얼어요."])]
  ] },
  { title: "생활 대화", groups: [
    ["상황별 말하기", ...[
      ["greeting", "인사", "이웃을 만났어요.", "안녕하세요."],
      ["family", "가정", "가족에게 물을 부탁해요.", "물 한 잔 주세요."],
      ["hospital", "병원", "접수처에서 예약을 확인해요.", "진료 예약을 확인해 주세요."],
      ["therapy", "재활치료", "잠깐 쉬고 싶어요.", "잠깐 쉬어도 될까요?"],
      ["cafe", "카페·식당", "카페에서 주문해요.", "따뜻한 차 한 잔 주세요."],
      ["shop", "마트·장보기", "우유가 어디 있는지 물어봐요.", "우유는 어디에 있나요?"],
      ["transit", "외출·교통", "버스가 역에 가는지 물어봐요.", "이 버스가 역에 가나요?"],
      ["feeling", "감정", "오늘 기분을 말해요.", "오늘 기분이 좋아요."],
      ["health", "통증·건강 표현", "아픈 곳을 말해요.", "오른쪽 무릎이 아파요."],
      ["help", "도움 요청", "문 열기가 어려워요.", "문 여는 것을 도와주세요."]
    ].map(([id, title, prompt, example]) => training(id, title, "open", [prompt, example]))]
  ] }
];

for (const { title, groups } of menus) {
  for (const [, ...entries] of groups) {
    for (const entry of entries) {
      if (typeof entry === "object") exercises.push({ ...entry, domain: title });
    }
  }
}

const reviewGroups = [
  ["wrong", "틀린 문제"], ["hint", "힌트 사용 문제"], ["hard", "어려웠던 낱말"],
  ["favorite", "즐겨찾기"], ["assigned", "보호자 지정 문제"]
];
