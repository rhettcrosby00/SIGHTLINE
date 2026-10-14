// Visualization scripts for the Rehearse pillar: about 45 seconds each, in
// three themes. Sport-neutral on purpose so any athlete can use them.
// Each line: [text, seconds]. One script per session, rotated so recent ones rest.

export const SCRIPTS = [
  // ---- First play ----
  { id: 'first-1', theme: 'First play', title: 'Opening whistle', lines: [
    ['Read each line, then close your eyes and see it.', 5],
    ['Picture the field before the first play: the lines, the lights, your teammates.', 7],
    ['Feel your feet ready under you. Your breathing is slow and steady.', 7],
    ['The play starts. You move first — quick, sharp, on time.', 7],
    ['Your first touch is clean. Your first decision is simple and right.', 7],
    ['The noise fades. Your eyes are already on the next action.', 6],
    ['You’re in it now. Calm, fast, ready.', 6],
  ] },
  { id: 'first-2', theme: 'First play', title: 'First touch', lines: [
    ['Read it, then close your eyes and picture it.', 5],
    ['See the ball, the puck, the play — coming your way.', 7],
    ['Your body is loose. Your eyes are sharp.', 6],
    ['You read it early and get there first.', 7],
    ['Your first touch is soft and controlled.', 7],
    ['You look up and see the right option right away.', 7],
    ['First play done. Confidence is up.', 6],
  ] },
  { id: 'first-3', theme: 'First play', title: 'Set the tone', lines: [
    ['Read each line, then picture it with your eyes closed.', 5],
    ['Walk into position. Notice how ready your legs feel.', 7],
    ['On the first play, your effort is the loudest thing out there.', 7],
    ['You win the first race to the ball. You hear your teammates react.', 8],
    ['You talk, you point, you organize.', 6],
    ['Every play after this feels easier.', 6],
    ['You set the tone.', 6],
  ] },
  { id: 'first-4', theme: 'First play', title: 'Eyes up', lines: [
    ['Read it, close your eyes, and see it.', 5],
    ['Picture your first moment on the field. See the space around you.', 7],
    ['Your eyes scan — left, right, ahead. You see everything early.', 8],
    ['The play comes. You already know where you’re going.', 7],
    ['You make the simple play, and you make it fast.', 6],
    ['You feel the game slow down for you.', 6],
    ['You’re seeing it well today.', 6],
  ] },

  // ---- Big moment ----
  { id: 'big-1', theme: 'Big moment', title: 'The moment arrives', lines: [
    ['Read each line, then close your eyes and live it.', 5],
    ['It’s late in the game. The score is close. The crowd is loud.', 7],
    ['You take one slow breath. Your heartbeat settles.', 7],
    ['The ball comes to you, and you want it.', 6],
    ['You see your target clearly. Nothing else matters.', 7],
    ['You execute exactly like you’ve practiced a thousand times.', 7],
    ['You did it. You were built for this.', 6],
  ] },
  { id: 'big-2', theme: 'Big moment', title: 'Clutch', lines: [
    ['Read it, then picture it with your eyes closed.', 5],
    ['Picture the biggest play of the game coming up.', 6],
    ['Your hands are steady. Your feet are light.', 6],
    ['You hear your cue word in your head.', 6],
    ['You move without thinking — smooth and fast.', 7],
    ['It works. See it. Hear the reaction.', 7],
    ['Feel how calm you were. That’s you under pressure.', 8],
  ] },
  { id: 'big-3', theme: 'Big moment', title: 'Slow it down', lines: [
    ['Read each line, then close your eyes and see it.', 5],
    ['Everything speeds up around you, but you slow it down.', 7],
    ['You notice the details: the angle, the space, the timing.', 7],
    ['You pick your moment and go.', 6],
    ['Your technique holds up. Clean and strong.', 7],
    ['You land the play exactly how you pictured it.', 7],
    ['Pressure is just a moment you’re ready for.', 6],
  ] },
  { id: 'big-4', theme: 'Big moment', title: 'Want the ball', lines: [
    ['Read it, then close your eyes and live it.', 5],
    ['The game is on the line. You step toward the action, not away.', 8],
    ['You call for it. Your voice is strong.', 6],
    ['You make your move with full commitment.', 7],
    ['No hesitation. No second-guessing.', 6],
    ['See the result you want. Feel it in your chest.', 7],
    ['You want these moments.', 6],
  ] },

  // ---- Bouncing back ----
  { id: 'back-1', theme: 'Bouncing back', title: 'Next play', lines: [
    ['Read each line, then close your eyes and see it.', 5],
    ['Picture a mistake — a missed play, a bad touch.', 6],
    ['You feel it for one second. Then you let it go.', 7],
    ['Take a breath. Say your cue word.', 6],
    ['Your eyes go to the next play right away.', 7],
    ['On the next play you’re sharp, loud, and involved.', 7],
    ['Mistakes don’t stick to you.', 7],
  ] },
  { id: 'back-2', theme: 'Bouncing back', title: 'Reset button', lines: [
    ['Read it, then picture it with your eyes closed.', 5],
    ['Something goes wrong. See it happen.', 6],
    ['Now see yourself hit reset: a breath, a clap, eyes up.', 8],
    ['You sprint back into position.', 6],
    ['Your next action is simple and strong.', 7],
    ['Your teammates see you respond.', 6],
    ['That’s who you are after a mistake.', 7],
  ] },
  { id: 'back-3', theme: 'Bouncing back', title: 'Short memory', lines: [
    ['Read each line, then close your eyes and see it.', 5],
    ['Picture a play that didn’t go your way.', 6],
    ['Watch it shrink, like a screen getting smaller and smaller.', 8],
    ['It’s gone. The game is still in front of you.', 7],
    ['You attack the next moment with full effort.', 7],
    ['You make a great play right after.', 6],
    ['Short memory. Big heart.', 6],
  ] },
  { id: 'back-4', theme: 'Bouncing back', title: 'Come back stronger', lines: [
    ['Read it, then close your eyes and live it.', 5],
    ['You’re behind. You feel the pressure building.', 6],
    ['You plant your feet and take one deep breath.', 7],
    ['You focus on one thing you control: your effort.', 7],
    ['Play by play, you win your small battles.', 7],
    ['The momentum turns. You can feel it.', 6],
    ['You never stop competing.', 7],
  ] },
];

export const scriptSeconds = (s) => s.lines.reduce((a, [, sec]) => a + sec, 0);
