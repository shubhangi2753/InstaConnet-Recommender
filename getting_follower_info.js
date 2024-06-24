const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs').promises;

const dataFilePath = 'instaUserData.json';
const API_KEY = 'ccadf28cfcmshbd7373e9ad2ae73p1b8622jsn3a51425bb43e';
const API_HOST = 'instagram-scraper-api2.p.rapidapi.com';

let userDataCache = {};

// Load existing data from the JSON file
async function loadUserData() {
    try {
        const fileContent = await fs.readFile(dataFilePath, 'utf8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.error('Error loading user data:', error);
        return {};
    }
}

// Save updated data to the JSON file
async function saveUserData(data) {
    try {
        await fs.writeFile(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving user data:', error);
    }
}

// Function to fetch and save followers for a specific username
async function fetchAndSaveFollowers(username) {
    let follower_id = [];
    let follower_username = [];
    let pagination_token = null;

    const options = {
        method: 'GET',
        url: 'https://instagram-scraper-api2.p.rapidapi.com/v1/followers',
        headers: {
            'X-RapidAPI-Key': API_KEY,
            'X-RapidAPI-Host': API_HOST
        }
    };

    do {
        options.params = { username_or_id_or_url: username, pagination_token };

        try {
            const response = await axios.request(options);
            const { items, pagination_token: nextToken } = response.data.data;

            items.forEach(item => {
                follower_username.push(item.username);
                follower_id.push(item.id);
            });

            pagination_token = nextToken;
        } catch (error) {
            console.error('API request error:', error.response ? error.response.data : error.message);
            break; // Exit loop on error to avoid infinite loop
        }

    } while (pagination_token != null);

    // Initialize lists if not already present and append new data
    if (!userDataCache[username]) {
        userDataCache[username] = {
            username,
            followers_id: [],
            followers_username: []
        };
    }

    userDataCache[username].followers_id = (userDataCache[username].followers_id || []).concat(follower_id);
    userDataCache[username].followers_username = (userDataCache[username].followers_username || []).concat(follower_username);

    await saveUserData(userDataCache);
    return { username, follower_id, follower_username };
}

// Function to process multiple usernames sequentially
async function processUsernames(usernames) {
    const results = [];

    for (const username of usernames) {
        const result = await fetchAndSaveFollowers(username);
        if (result) results.push(result);
    }

    return results;
}

// Route to handle POST requests
router.post('/', async (req, res) => {
    try {
        userDataCache = await loadUserData();

        // Get all usernames from the loaded data
        const usernames = Object.keys(userDataCache);

        // Filter usernames that do not already have followers_username and followers_id
        const usernamesToProcess = usernames.filter(username => 
            !userDataCache[username].followers_username || 
            !userDataCache[username].followers_id
        );

        // Process each filtered username to fetch followers
        const results = await processUsernames(usernamesToProcess);

        // Save the updated data back to the JSON file
        await saveUserData(userDataCache);

        // Respond with the results
        res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching Instagram user data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
