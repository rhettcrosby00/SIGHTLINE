// Readiness: "How do you feel?" Flat · Ready · Wired. One tap on the FOCUS
// screen, above the presets (Ready unless changed), and the session adapts
// (js/plan.js). Shown on the summary only; nothing is saved. It's a
// self-check, not a measurement.

export const STATE_LABELS = {
  flat: { name: 'Flat', hint: 'Low energy', does: 'A short calm, then energizing breaths and quicker cues.' },
  ready: { name: 'Ready', hint: 'Good to go', does: 'The standard routine.' },
  wired: { name: 'Wired', hint: 'Amped up or nervous', does: 'Extra calming breaths first, then calmer cues.' },
};

export const feelSeg = (state) => `
  <div class="seg seg--fill feel-seg" role="radiogroup" aria-label="How do you feel?">
    ${Object.entries(STATE_LABELS).map(([id, s]) => `
      <button type="button" role="radio" data-feel="${id}" aria-checked="${id === state}">${s.name}</button>`).join('')}
  </div>`;
