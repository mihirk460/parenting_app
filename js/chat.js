// "Buddy": a voice chat bot for the kid. Talks through the browser's speech
// APIs. The brain is chosen in parent Settings: OpenRouter (free models),
// Claude, or a small built-in set of stories/jokes so the page still works.
import { S } from './store.js';
import { esc, on } from './ui.js';

const STORIES = [
  'Once upon a time, a tiny turtle named Tilly wanted to see the top of the tallest hill. Everyone said she was too slow. So Tilly walked a little bit every single day. On the seventh day she reached the top, and the sunset was the most beautiful thing she had ever seen. Slow and steady really does win.',
  'Milo the mouse found a shiny red button in the forest. When he pressed it, all the trees started to giggle! The giggling trees dropped acorns everywhere, so Milo and his friends had a giant acorn picnic. From then on, Milo pressed the button every Friday for Giggle Day.',
  'There was a cloud named Puff who was afraid of raining. One day the flowers below were so thirsty that Puff took a deep breath and let out a tiny drizzle. The flowers cheered! Puff learned that even scary things can help your friends.',
];
const JOKES = [
  'Why did the cookie go to the doctor? Because it felt crummy!',
  'What do you call a sleeping dinosaur? A dino-snore!',
  'Why can\'t you give Elsa a balloon? Because she will let it go!',
  'What is a cat\'s favorite color? Purr-ple!',
];
const FACTS = [
  'Octopuses have three hearts and blue blood!',
  'A group of flamingos is called a flamboyance.',
  'Honey never goes bad. Archaeologists found 3000-year-old honey that was still good to eat.',
  'Sloths can hold their breath longer than dolphins can.',
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function systemPrompt(kid) {
  return `You are Buddy, a friendly voice assistant for a child named ${kid.name}. Keep answers short (2-4 sentences) because they are read aloud, unless the child asks for a story, then tell a fun 6-10 sentence story with a happy ending. Use simple words a young child understands. Be warm, encouraging and playful. Never discuss violence, scary, adult or unsafe topics; if asked, gently say that is a question for a grown-up and offer something fun instead. Never ask for or repeat personal details like address, school or phone numbers. Do not use emojis or markdown.`;
}

// Which brain is active. Old saved data has no `provider` field.
export function provider() {
  const s = S().settings;
  if (s.provider) return s.provider;
  return s.apiKey ? 'anthropic' : 'local';
}
export const DEFAULT_OPENROUTER_MODEL = 'nvidia/nemotron-nano-9b-v2:free';

function chatMessages(history) {
  return history.slice(-10).map((m) => ({ role: m.role, content: m.text }));
}

function localBrain(text) {
  const t = text.toLowerCase();
  if (t.includes('story')) return pick(STORIES);
  if (t.includes('joke')) return pick(JOKES);
  if (t.includes('fact')) return pick(FACTS);
  if (/\b(hi|hello|hey)\b/.test(t)) return 'Hi there! Ask me for a story, a joke, or a fun fact.';
  return 'I can tell you a story, a joke, or a fun fact. For other questions, ask a parent to turn on my big brain in Settings.';
}

async function claudeBrain(kid, history) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': S().settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 1024,
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: systemPrompt(kid),
      messages: chatMessages(history),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Request failed (${res.status})`);
  }
  const data = await res.json();
  if (data.stop_reason === 'refusal') return 'Hmm, that is a question for a grown-up. Want a story instead?';
  return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

// OpenRouter: OpenAI-compatible, allows browser calls, has free models.
async function openrouterBrain(kid, history) {
  const s = S().settings;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${s.openrouterKey}`,
      'HTTP-Referer': location.origin,
      'X-Title': 'Chore Quest',
    },
    body: JSON.stringify({
      model: s.openrouterModel || DEFAULT_OPENROUTER_MODEL,
      max_tokens: 600,
      messages: [{ role: 'system', content: systemPrompt(kid) }, ...chatMessages(history)],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error?.message || `Request failed (${res.status})`);
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('The model sent back an empty reply.');
  return text;
}

export function chatView(container, kid) {
  const history = [];
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canListen = Boolean(SR);
  const canSpeak = 'speechSynthesis' in window;
  const brain = provider();
  const hasKey = brain !== 'local';

  container.innerHTML = `
    <div class="card" style="text-align:center">
      <div style="font-size:56px">🤖</div>
      <h2>Hi ${esc(kid.name)}, I'm Buddy!</h2>
      <p class="muted">${hasKey ? 'Ask me anything, or say "tell me a story".' : 'Ask me for a story, a joke, or a fun fact.'}</p>
    </div>
    <div class="chat-log" id="log"></div>
    <div class="quick">
      <button class="chip" data-say="Tell me a story">📖 Story</button>
      <button class="chip" data-say="Tell me a joke">😂 Joke</button>
      <button class="chip" data-say="Tell me a fun fact">🧠 Fun fact</button>
      ${hasKey ? '<button class="chip" data-say="Why is the sky blue?">🌤️ Why is the sky blue?</button>' : ''}
    </div>
    <form class="chat-input" id="form">
      <input type="text" id="text" placeholder="Type or tap the mic…" autocomplete="off">
      <button type="button" class="btn icon mic" id="mic" ${canListen ? '' : 'disabled title="Voice input not supported in this browser"'}>🎤</button>
      <button type="submit" class="btn icon">➤</button>
    </form>
    <p class="muted" style="margin-top:8px">${canListen ? '' : 'Voice input needs Safari or Chrome. '}${canSpeak ? '' : 'This browser cannot read replies aloud.'}</p>`;

  const log = container.querySelector('#log');
  const input = container.querySelector('#text');
  const mic = container.querySelector('#mic');

  function add(role, text) {
    history.push({ role, text });
    const b = document.createElement('div');
    b.className = `bubble ${role === 'user' ? 'me' : 'bot'}`;
    b.textContent = text;
    log.appendChild(b);
    b.scrollIntoView({ block: 'end', behavior: 'smooth' });
    return b;
  }

  function speak(text) {
    if (!canSpeak || !S().settings.voice) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1.1;
    speechSynthesis.speak(u);
  }

  async function ask(text) {
    text = text.trim();
    if (!text) return;
    input.value = '';
    add('user', text);
    const thinking = add('assistant', '…');
    history.pop(); // placeholder is not part of the conversation
    let reply;
    try {
      reply = brain === 'openrouter' ? await openrouterBrain(kid, history)
        : brain === 'anthropic' ? await claudeBrain(kid, history)
        : localBrain(text);
    } catch (e) {
      reply = `Oops, my brain is not working right now. (${e.message})`;
    }
    thinking.remove();
    add('assistant', reply);
    speak(reply);
  }

  container.querySelector('#form').addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
  on(container, 'click', '[data-say]', (el) => ask(el.dataset.say));

  if (canListen) {
    const rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = false;
    rec.onresult = (e) => ask(e.results[0][0].transcript);
    rec.onend = () => mic.classList.remove('listening');
    rec.onerror = () => mic.classList.remove('listening');
    mic.onclick = () => {
      if (mic.classList.contains('listening')) { rec.stop(); return; }
      speechSynthesis?.cancel();
      mic.classList.add('listening');
      try { rec.start(); } catch { mic.classList.remove('listening'); }
    };
  }

  return { stop: () => canSpeak && speechSynthesis.cancel() };
}
