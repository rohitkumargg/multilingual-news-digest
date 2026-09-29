/**
 * MND — Multilingual News Digest
 * Article-level Categorization System.
 * 
 * Accurately classifies an article based on its actual content (title + snippet).
 * Assigns exactly one category from the fixed 4 categories:
 * - Sports ('sports')
 * - Education ('education')
 * - Technology ('technology')
 * - Politics & Foreign Affairs ('politics')
 */

export const FIXED_CATEGORIES = [
  { id: 'sports', label: 'Sports' },
  { id: 'education', label: 'Education' },
  { id: 'technology', label: 'Technology' },
  { id: 'politics', label: 'Politics & Foreign Affairs' },
];

export const VALID_CATEGORY_IDS = FIXED_CATEGORIES.map((c) => c.id);

// Detailed, domain-specific terminology for Indian & international news contexts
const CATEGORY_VOCABULARY = {
  sports: {
    // High-confidence terms (weight: 3)
    strong: [
      'cricket', 'ipl', 'bcci', 'icc', 'wpl', 'test match', 'odi', 't20', 'wicket', 'century',
      'football', 'fifa', 'isl', 'premier league', 'champions league', 'uefa', 'messi', 'ronaldo',
      'tennis', 'wimbledon', 'grand slam', 'atp', 'wta', 'djokovic', 'alcaraz',
      'hockey', 'fih', 'badminton', 'bwf', 'olympics', 'paralympics', 'athletics',
      'kabaddi', 'pro kabaddi', 'wrestling', 'boxing', 'archery', 'shooting sport',
      'asian games', 'commonwealth games', 'world cup', 'tournament', 'championship',
      'ranji trophy', 'duleep trophy',
    ],
    // Regular terms (weight: 1.5)
    medium: [
      'match', 'stadium', 'athlete', 'player', 'coach', 'squad', 'striker', 'bowler', 'batter',
      'batsman', 'goalkeeper', 'semifinal', 'final', 'knockout', 'quarterfinal', 'medal',
      'gold medal', 'silver medal', 'bronze medal', 'derby', 'scorecard', 'innings',
      'goal', 'penalty', 'referee', 'umpire', 'league table', 'fixture', 'points table',
    ],
  },
  education: {
    // High-confidence terms (weight: 3)
    strong: [
      'school', 'schools', 'college', 'colleges', 'university', 'universities', 'campus',
      'iit', 'iits', 'nit', 'nits', 'aiims', 'iim', 'iims', 'bits pilani', 'ugc', 'aicte',
      'cbse', 'icse', 'state board', 'ncert', 'neet', 'jee main', 'jee advanced', 'upsc',
      'cuet', 'cat exam', 'gate exam', 'admissions', 'entrance exam', 'scholarship',
      'scholarships', 'syllabus', 'curriculum', 'education policy', 'nep 2020',
      'marksheet', 'board exam', 'convocation', 'degree', 'diploma', 'phd',
    ],
    // Regular terms (weight: 1.5)
    medium: [
      'student', 'students', 'teacher', 'teachers', 'professor', 'faculty', 'classroom',
      'academics', 'academic', 'pedagogy', 'exam', 'examination', 'hall ticket', 'admit card',
      'answer key', 'result declared', 'cut off', 'merit list', 'counseling', 'tuition',
      'kindergarten', 'matriculation', 'higher secondary', 'undergraduate', 'postgraduate',
      'research fellowship',
    ],
  },
  technology: {
    // High-confidence terms (weight: 3)
    strong: [
      'artificial intelligence', 'machine learning', 'deep learning', 'genai', 'llm', 'chatgpt',
      'openai', 'gemini', 'anthropic', 'software', 'hardware', 'cybersecurity', 'semiconductor',
      'semiconductors', 'microchip', 'chips act', 'foundry', 'tsmc', 'nvidia', 'intel', 'amd',
      'quantum computing', 'supercomputer', 'gadget', 'gadgets', 'smartphone', 'smartphones',
      'startup', 'startups', 'fintech', 'edtech', 'saas', 'space technology', 'isro', 'nasa',
      'satellite', 'chandrayaan', 'gaganyaan', 'spacex', 'cloud computing', 'aws', 'azure',
      'cryptocurrency', 'blockchain', '5g', '6g', 'telecom', 'silicon valley',
    ],
    // Regular terms (weight: 1.5)
    medium: [
      'tech', 'digital', 'app', 'apps', 'internet', 'algorithm', 'operating system', 'android',
      'ios', 'apple', 'google', 'microsoft', 'meta', 'metaverse', 'robotics', 'robot',
      'drone', 'drones', 'electric vehicle', 'ev battery', 'data center', 'cyber attack',
      'malware', 'ransomware', 'firmware', 'processor', 'coding', 'developer', 'browser',
    ],
  },
  politics: {
    // High-confidence terms (weight: 3)
    strong: [
      'parliament', 'lok sabha', 'rajya sabha', 'assembly', 'vidhan sabha', 'election',
      'elections', 'by-election', 'poll', 'polls', 'voting', 'voter', 'election commission',
      'bjp', 'congress', 'aap', 'trinamool', 'dmk', 'aiadmk', 'bjd', 'yrcp', 'tdp', 'cpm',
      'prime minister', 'chief minister', 'narendra modi', 'rahul gandhi', 'president droupadi murmu',
      'cabinet minister', 'union minister', 'governor', 'mla', 'mp', 'political party',
      'bill passed', 'ordinance', 'legislation', 'foreign affairs', 'diplomacy', 'diplomatic',
      'bilateral', 'geopolitics', 'united nations', 'security council', 'mea', 'external affairs',
      's jaishankar', 'treaty', 'sanctions', 'ambassador', 'summit', 'g20', 'brics', 'quad',
    ],
    // Regular terms (weight: 1.5)
    medium: [
      'government', 'governance', 'policy', 'state government', 'central government',
      'ruling party', 'opposition', 'rally', 'manifesto', 'campaign', 'caucus', 'constituency',
      'supreme court', 'high court', 'judiciary', 'verdict', 'constitution', 'constitutional',
      'protest', 'bureaucracy', 'ias', 'ips', 'relations', 'envoy', 'international talks',
    ],
  },
};

/**
 * Score a single category against the given title and snippet.
 */
function scoreCategory(categoryKey, titleText, snippetText) {
  const vocab = CATEGORY_VOCABULARY[categoryKey];
  if (!vocab) return 0;

  let score = 0;

  // Title matches are weighted 2.5x more heavily than snippet matches
  const titleLower = ` ${titleText.toLowerCase()} `;
  const snippetLower = ` ${snippetText.toLowerCase()} `;

  const checkMatches = (words, baseWeight) => {
    for (const phrase of words) {
      // Word boundary match
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');

      if (regex.test(titleLower)) {
        score += baseWeight * 2.5;
      }
      if (regex.test(snippetLower)) {
        score += baseWeight;
      }
    }
  };

  checkMatches(vocab.strong, 3.0);
  checkMatches(vocab.medium, 1.5);

  return score;
}

/**
 * Classify an article based on its title and snippet.
 * 
 * @param {Object} article - Object containing { title, snippet }
 * @param {string} [hintCategory] - Optional category hint from feed source
 * @returns {Object} { categoryId, categoryLabel, score, isVerified }
 */
export function classifyArticle(article, hintCategory = null) {
  const title = article.title || '';
  const snippet = article.snippet || '';

  const scores = {
    sports: scoreCategory('sports', title, snippet),
    education: scoreCategory('education', title, snippet),
    technology: scoreCategory('technology', title, snippet),
    politics: scoreCategory('politics', title, snippet),
  };

  // If a hintCategory was provided (e.g. from dedicated feed), add a modest tie-breaker bonus
  if (hintCategory && scores[hintCategory] !== undefined) {
    scores[hintCategory] += 1.0;
  }

  // Find the category with maximum score
  let bestCategory = 'politics'; // Default fallback
  let maxScore = -1;

  for (const cat of FIXED_CATEGORIES) {
    if (scores[cat.id] > maxScore) {
      maxScore = scores[cat.id];
      bestCategory = cat.id;
    }
  }

  // If all scores are 0, use hintCategory if valid, else fallback to politics
  if (maxScore <= 0) {
    if (hintCategory && VALID_CATEGORY_IDS.includes(hintCategory)) {
      bestCategory = hintCategory;
    } else {
      bestCategory = 'politics';
    }
  }

  const categoryObj = FIXED_CATEGORIES.find((c) => c.id === bestCategory);

  return {
    categoryId: bestCategory,
    categoryLabel: categoryObj ? categoryObj.label : 'Politics & Foreign Affairs',
    score: maxScore,
    allScores: scores,
  };
}

/**
 * Validates whether an article belongs to the expected category.
 * If the article scored significantly higher for a different category, returns false.
 */
export function verifyArticleCategory(article, expectedCategory) {
  const { categoryId, score, allScores } = classifyArticle(article, expectedCategory);
  
  if (categoryId === expectedCategory) {
    return true;
  }

  // If another category has a decisively higher score, reject
  const expectedScore = allScores[expectedCategory] || 0;
  if (score >= expectedScore + 3.0 && score >= 4.0) {
    return false;
  }

  return true;
}
