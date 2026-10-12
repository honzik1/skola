const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadMathQuiz() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];
  const context = { window: {} };
  vm.runInNewContext(script, context);
  return context.window.MathQuiz;
}

const SETTINGS_STORAGE_KEY = 'mathQuizSettings';

class FakeStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

class FakeElement {
  constructor(document) {
    this.ownerDocument = document;
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.className = '';
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  dispatchEvent(type, event = {}) {
    const listener = this.listeners[type];
    if (!listener) {
      return;
    }

    listener({
      preventDefault() {},
      ...event,
    });
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  setAttribute() {}
}

function loadQuizApp(storage = new FakeStorage()) {
  const document = { activeElement: null };
  const selectors = [
    '#settings-form',
    '#settings-screen',
    '#quiz-screen',
    '#results-screen',
    '#settings-message',
    '#quiz-notice',
    '#progress-label',
    '#progress-bar',
    '#question-expression',
    '#answer-form',
    '#answer-input',
    '#check-button',
    '#feedback',
    '#next-button',
    '#results-title',
    '#correct-count',
    '#incorrect-count',
    '#total-count',
    '#score-percentage',
    '#new-quiz-button',
    '#question-count',
  ];
  const elements = Object.fromEntries(
    selectors.map((selector) => [selector, new FakeElement(document)]),
  );
  const operationInputs = [
    { value: 'multiplication', checked: true },
    { value: 'division', checked: false },
  ];
  const tableInputs = Array.from({ length: 10 }, (_, index) => ({
    value: String(index + 1),
    checked: true,
  }));
  const settingsForm = elements['#settings-form'];
  settingsForm.querySelectorAll = (selector) => {
    if (selector.includes('operation')) {
      return selector.includes(':checked')
        ? operationInputs.filter((input) => input.checked)
        : operationInputs;
    }
    if (selector.includes('table-number')) {
      return selector.includes(':checked')
        ? tableInputs.filter((input) => input.checked)
        : tableInputs;
    }
    return [];
  };
  document.querySelector = (selector) => elements[selector];

  const window = {
    localStorage: storage,
    setTimeout(callback) {
      callback();
    },
  };
  const context = { window, document };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
      .match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1],
    context,
  );

  return {
    document,
    settingsForm,
    questionCount: elements['#question-count'],
    questionExpression: elements['#question-expression'],
    answerForm: elements['#answer-form'],
    answerInput: elements['#answer-input'],
    nextButton: elements['#next-button'],
    operationInputs,
    tableInputs,
  };
}

test('generates the selected multiplication table from 1 to 10', () => {
  const mathQuiz = loadMathQuiz();
  const questions = mathQuiz.generateQuestions({
    operations: ['multiplication'],
    selectedNumbers: [2],
    count: 100,
    random: () => 0.5,
  });

  assert.equal(questions.length, 10);
  assert.deepEqual(
    new Set(questions.map((question) => question.text)),
    new Set(Array.from({ length: 10 }, (_, index) => `2 × ${index + 1}`)),
  );
});

test('combines multiple selected multiplication tables without duplicates', () => {
  const mathQuiz = loadMathQuiz();
  const questions = mathQuiz.generateQuestions({
    operations: ['multiplication'],
    selectedNumbers: [2, 5],
    count: 100,
    random: () => 0.5,
  });

  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map((question) => question.key)).size, 20);
  assert.ok(questions.every((question) => /^(2|5) × (?:[1-9]|10)$/.test(question.text)));
});

test('moves focus to the next question button after checking an answer', () => {
  const app = loadQuizApp();
  app.questionCount.value = '1';
  app.settingsForm.dispatchEvent('submit');

  const [left, right] = app.questionExpression.textContent.split(' × ').map(Number);
  app.answerInput.value = String(left * right);
  app.answerForm.dispatchEvent('submit');

  assert.equal(app.nextButton.hidden, false);
  assert.equal(app.document.activeElement, app.nextButton);
});

test('restores the last test settings from localStorage', () => {
  const storage = new FakeStorage({
    [SETTINGS_STORAGE_KEY]: JSON.stringify({
      operations: ['division'],
      selectedNumbers: [3, 7],
      questionCount: 12,
    }),
  });
  const app = loadQuizApp(storage);

  assert.deepEqual(
    app.operationInputs.map(({ value, checked }) => ({ value, checked })),
    [
      { value: 'multiplication', checked: false },
      { value: 'division', checked: true },
    ],
  );
  assert.deepEqual(
    app.tableInputs.filter((input) => input.checked).map((input) => Number(input.value)),
    [3, 7],
  );
  assert.equal(app.questionCount.value, '12');
});

test('saves the current test settings when they change', () => {
  const storage = new FakeStorage();
  const app = loadQuizApp(storage);
  app.operationInputs[0].checked = false;
  app.operationInputs[1].checked = true;
  app.tableInputs.forEach((input) => {
    input.checked = ['2', '5'].includes(input.value);
  });
  app.questionCount.value = '15';
  app.settingsForm.dispatchEvent('change');
  app.questionCount.dispatchEvent('input');

  assert.deepEqual(JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY)), {
    operations: ['division'],
    selectedNumbers: [2, 5],
    questionCount: 15,
  });
});
