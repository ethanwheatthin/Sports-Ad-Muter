// Decision-model support (Ollama /v1/systemone, e.g. clef-flash).
// Pure helpers shared by the background service worker (importScripts) and tests.

const DECISION_THRESHOLDS = {
  gameplay: 0.6, // P(broadcast) at or above this -> gameplay (unmute)
  ad: 0.4        // P(broadcast) at or below this -> ad (mute); in between -> inconclusive
};

const DECISION_QUESTION_KEY = 'frame';

function buildDecisionRequest(model, base64Image) {
  return {
    model,
    state: 'This is a frame captured from a TV sports broadcast stream.',
    images: [base64Image],
    // Keep the model resident between checks so it isn't reloaded (~10s) each time.
    keep_alive: '30m',
    questions: {
      [DECISION_QUESTION_KEY]: {
        type: 'choice',
        instructions: 'Is this frame part of the live sports broadcast, or is it an ad break?',
        criteria: {
          broadcast:
            'Live sports broadcast content: active gameplay, athletes or players, the venue, ' +
            'scoreboard or game graphics, replays, sideline interviews, studio analysts, ' +
            'crowd shots, press conferences, pre/post-game coverage',
          ad_break:
            'Commercials, advertisements, promos, sponsor bumpers, static graphics, ' +
            'halftime entertainment, or non-sports content'
        }
      }
    }
  };
}

// Turn a /v1/systemone response into the extension's analysis result.
// result: true = gameplay, false = ad, null = inconclusive.
function interpretDecision(data, thresholds = DECISION_THRESHOLDS) {
  const answer = data && data.answers && data.answers[DECISION_QUESTION_KEY];
  const pBroadcast = answer && answer.probabilities && answer.probabilities.broadcast;
  if (typeof pBroadcast !== 'number') {
    return { result: null, probability: null };
  }
  let result = null;
  if (pBroadcast >= thresholds.gameplay) result = true;
  else if (pBroadcast <= thresholds.ad) result = false;
  return { result, probability: pBroadcast };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DECISION_THRESHOLDS, buildDecisionRequest, interpretDecision };
}
