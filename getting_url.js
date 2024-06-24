const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs').promises;

const RATE_LIMIT_DELAY = 60000; // 1 minute delay for rate limiting
const CONNECTION_RETRY_DELAY = 5000; // 5 seconds delay for connection retries
const REQUEST_DELAY = 2000; // 2 seconds delay between requests
const MAX_CONCURRENT_REQUESTS = 5; // Max concurrent requests

let userDataCache = {};

router.get('/', async (req, res) => {
  try {
    const fileContent = await fs.readFile('instaUserData.json', 'utf8');
    userDataCache = JSON.parse(fileContent);

    const followersUsername = userDataCache.dhakad___deepak.followers_username;

    const results = await processUsernames(followersUsername);

    await fs.writeFile('instaUserData.json', JSON.stringify(userDataCache, null, 2), 'utf8');

    res.status(200).json(results);
  } catch (error) {
    console.error('Error reading JSON file:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function processUsernames(usernames) {
  const results = [];
  const queue = [];

  for (const username of usernames) {
    queue.push(async () => {
      const result = await processUsername(username);
      if (result) results.push(result);
    });

    if (queue.length >= MAX_CONCURRENT_REQUESTS) {
      await Promise.all(queue.map(fn => fn()));
      queue.length = 0; // Clear the queue
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
    }
  }

  // Process any remaining tasks in the queue
  if (queue.length > 0) {
    await Promise.all(queue.map(fn => fn()));
  }

  return results;
}

async function processUsername(username) {
  try {
    const instaUserData = await fetchDataWithRetry(username);
    if (instaUserData && !instaUserData.is_private) {
      await saveUserData(username, instaUserData);
      return instaUserData;
    }
  } catch (error) {
    console.error(`Error processing data for username ${username}:`, error.message);
    return null;
  }
}

async function fetchDataWithRetry(username, retries = 3, delay = 1000) {
  for (let retryCount = 0; retryCount < retries; retryCount++) {
    try {
      return await fetchUserData(username);
    } catch (error) {
      if (error.response) {
        if (error.response.status === 429) {
          console.error(`Rate limit exceeded for username ${username}. Waiting before retrying... (${retryCount + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        } else if (error.response.status === 403) {
          console.error(`API subscription error for username ${username}: ${error.response.data.message}`);
          return null; // No point in retrying if the API key is not valid
        }
      } else if (error.code === 'ECONNRESET' || error.message.includes('closed by a peer')) {
        console.error(`Connection reset by peer for username ${username}. Waiting before retrying... (${retryCount + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, CONNECTION_RETRY_DELAY));
      } else {
        console.error(`Error fetching data for username ${username}. Retrying... (${retryCount + 1}/${retries})`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
      if (retryCount === retries - 1) {
        console.error(`Failed to fetch data for username ${username} after ${retries} retries.`);
        return null;
      }
    }
  }
}

async function fetchUserData(username) {
  try {
    const options = {
      method: 'GET',
      url: 'https://instagram-scraper-api2.p.rapidapi.com/v1/info',
      params: { username_or_id_or_url: username },
      headers: {
        'X-RapidAPI-Key': '72ec0d8ffemshc0ad15d6ba3290fp15a7a0jsnb61eef0955aa',
        'X-RapidAPI-Host': 'instagram-scraper-api2.p.rapidapi.com'
      },
      timeout: 10000  // Set a higher timeout for the request
    };

    const response = await axios.request(options);
    const data = response.data.data;

    return {
      username: data.username,
      id: data.id,
      isVerified: data.is_verified,
      fullname: data.full_name,
      followerCount: data.follower_count,
      followingCount: data.following_count,
      location: data.location_data.city_name,
      bio: bioKeyWords(data.biography),
      is_private: data.is_private
    };
  } catch (error) {
    console.error(`Error fetching data for username ${username}:`, error.message);
    if (error.response) {
      console.error(`Response status: ${error.response.status}`);
      console.error(`Response data: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

function bioKeyWords(biography) {
  const stopWords = [
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", "yourself", "yourselves",
    "he", "him", "his", "himself", "she", "her", "hers", "herself", "it", "its", "itself", "they", "them", "their",
    "theirs", "themselves", "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are",
    "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "a", "an",
    "the", "and", "but", "if", "or", "because", "as", "until", "while", "of", "at", "by", "for", "with", "about",
    "against", "between", "into", "through", "during", "before", "after", "above", "below", "to", "from", "up",
    "down", "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here", "there", "when",
    "where", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", "no",
    "nor", "not", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will", "just", "don",
    "should", "now"
  ];

  function extractKeywords(bio, stopWords) {
    const words = preprocessText(bio);
    const wordFrequencies = countWordFrequencies(words);
    return Object.keys(wordFrequencies).sort((a, b) => wordFrequencies[b] - wordFrequencies[a]);
  }

  function preprocessText(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/gi, '')
      .split(/\s+/)
      .filter(word => word.length > 0 && !stopWords.includes(word));
  }

  function countWordFrequencies(words) {
    return words.reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {});
  }

  return extractKeywords(biography, stopWords);
}

async function saveUserData(username, data) {
  userDataCache[username] = data;
}

module.exports = router;
