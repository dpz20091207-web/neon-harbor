// Neon Harbor — the story: six linked missions for the Harbor Kings crew
// against their rivals, the Dock Rats. Each mission has intro dialogue,
// a chain of stages and a cash reward.
import { dist } from './util.js';

export const MISSIONS = [
  {
    id: 1,
    title: 'First Pickup',
    giver: 'MARA (Harbor Kings)',
    reward: 250,
    intro: [
      'MARA: "New blood, huh? The Kings run this harbor, and couriers keep it fed."',
      'MARA: "Pick up the package at the Marina kiosk. Bring it to the Kings club in Downtown."',
      'MARA: "Walk or drive — just don\'t draw the cops. Good luck, kid."',
    ],
    stages: [
      { type: 'goto', x: 2050, y: 320, label: 'Pick up the package at the Marina kiosk', radius: 46 },
      { type: 'goto', x: 1300, y: 500, label: 'Deliver the package to the Kings Club, Downtown', radius: 46 },
    ],
  },
  {
    id: 2,
    title: 'Hot Wheels',
    giver: 'MARA (Harbor Kings)',
    reward: 600,
    intro: [
      'MARA: "The crew needs wheels with some bite. A Comet GT is parked by the Downtown garage."',
      'MARA: "Take it. Yes, take it — it\'s not yours, that\'s the point. Cops will notice."',
      'MARA: "Bring it to the Kings garage on the east side. Don\'t scratch the paint."',
    ],
    stages: [
      { type: 'steal', x: 1250, y: 700, label: 'Steal the Comet GT (press E beside it)', radius: 60 },
      { type: 'deliverCar', x: 2150, y: 700, label: 'Drive the Comet GT to the Kings garage', radius: 70 },
    ],
  },
  {
    id: 3,
    title: 'Getaway Driver',
    giver: 'DEX (Harbor Kings)',
    reward: 900,
    intro: [
      'DEX: "Rats ratted us out. I\'m pinned at the Docks with a bag of cash and two stars on me."',
      'DEX: "Come get me. Then drive like the harbor is on fire — the safehouse is in Old Town."',
      'DEX: "Lose the cops on the way, or we\'re both doing time."',
    ],
    stages: [
      { type: 'goto', x: 350, y: 1450, label: 'Reach Dex at the Docks', radius: 50 },
      { type: 'escape', x: 850, y: 1150, label: 'Get Dex to the Old Town safehouse — lose the cops', radius: 60 },
    ],
  },
  {
    id: 4,
    title: 'Turf War',
    giver: 'MARA (Harbor Kings)',
    reward: 1200,
    intro: [
      'MARA: "The Dock Rats are pushing into our piers. Three of their shooters hold the south dock."',
      'MARA: "Go settle it. Fists or pistol — your call. Just come back standing."',
      'MARA: "The harbor remembers who holds the docks."',
    ],
    stages: [
      { type: 'kill', x: 350, y: 1500, label: 'Clear the Dock Rats off the south pier (0/3)', radius: 90, count: 3 },
    ],
  },
  {
    id: 5,
    title: 'The Big Score',
    giver: 'DEX (Harbor Kings)',
    reward: 2000,
    intro: [
      'DEX: "A cash van parks at the Marina every night. The Kings are taking it tonight."',
      'DEX: "Grab the three money bags from the van, then get clear before the PD locks the streets."',
      'DEX: "This is the one that makes us kings for real."',
    ],
    stages: [
      { type: 'collect', x: 1900, y: 450, label: 'Grab the money bags from the cash van (0/3)', radius: 60, count: 3 },
      { type: 'escape', x: 1300, y: 500, label: 'Escape to the Kings Club with the cash', radius: 60 },
    ],
  },
  {
    id: 6,
    title: 'King of the Harbor',
    giver: 'MARA (Harbor Kings)',
    reward: 5000,
    intro: [
      'MARA: "RAT KING himself is at the Docks with his whole crew. This ends tonight."',
      'MARA: "Take down Rat King and his lieutenants, then plant the Kings flag on the pier."',
      'MARA: "Win this, and the harbor is ours. You\'ll be a King, not just a runner."',
    ],
    stages: [
      { type: 'kill', x: 350, y: 1500, label: 'Defeat Rat King and his lieutenants (0/4)', radius: 110, count: 4 },
      { type: 'goto', x: 300, y: 1650, label: 'Plant the Kings flag on the pier', radius: 50 },
    ],
  },
];

export function createMissionState() {
  return {
    index: 0, // index into MISSIONS
    active: false,
    stage: 0,
    showingIntro: false,
    introLine: 0,
    progress: 0,
    completed: [],
    toast: '',
    toastT: 0,
    stageDoneT: 0,
  };
}

export function currentMission(ms) {
  return MISSIONS[ms.index] || null;
}

export function currentStage(ms) {
  const m = currentMission(ms);
  return m ? m.stages[ms.stage] : null;
}

export function missionObjectiveText(ms) {
  if (!ms.active) {
    if (ms.index >= MISSIONS.length) return 'Story complete — you rule Neon Harbor. Free roam!';
    const next = MISSIONS[ms.index];
    return 'Next job: ' + next.title + ' — find the yellow "!" marker to start';
  }
  const st = currentStage(ms);
  if (!st) return '';
  let label = st.label;
  if (st.type === 'kill' || st.type === 'collect') {
    label = label.replace(/\(\d+\/\d+\)/, '(' + ms.progress + '/' + st.count + ')');
  }
  return label;
}

// Where the yellow start marker sits when no mission is active.
export function missionStartPoint(ms) {
  const points = [
    { x: 1300, y: 500 }, { x: 1250, y: 700 }, { x: 350, y: 1450 },
    { x: 350, y: 1500 }, { x: 1900, y: 450 }, { x: 350, y: 1500 },
  ];
  return points[Math.min(ms.index, points.length - 1)];
}

export function startMission(ms) {
  const m = currentMission(ms);
  if (!m) return;
  ms.active = true;
  ms.stage = 0;
  ms.progress = 0;
  ms.showingIntro = true;
  ms.introLine = 0;
}

export function advanceStage(ms) {
  const m = currentMission(ms);
  if (!m) return false;
  ms.stage++;
  ms.progress = 0;
  ms.stageDoneT = 0;
  if (ms.stage >= m.stages.length) {
    ms.active = false;
    ms.completed.push(m.id);
    ms.index++;
    return true; // mission complete
  }
  return false;
}

// Check a "goto / deliverCar / escape" stage against the player's position.
// Returns 'done' when the stage completes, 'active' otherwise.
export function checkReachStage(ms, px, py, inCar, wanted) {
  const st = currentStage(ms);
  if (!st || ms.showingIntro) return 'idle';
  if (st.type === 'goto' || st.type === 'deliverCar') {
    if (st.type === 'deliverCar' && !inCar) return 'active';
    if (dist(px, py, st.x, st.y) < st.radius) return 'done';
  }
  if (st.type === 'escape') {
    if (dist(px, py, st.x, st.y) < st.radius && wanted === 0) return 'done';
  }
  return 'active';
}
