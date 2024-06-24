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

// Function to fetch and save following for a specific username
async function fetchAndSaveFollowing(username) {
    let following_id = [];
    let following_username = [];
    let pagination_token = null;

    const options = {
        method: 'GET',
        url: 'https://instagram-scraper-api2.p.rapidapi.com/v1/following',
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
                following_username.push(item.username);
                following_id.push(item.id);
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
            following_id: [],
            following_username: []
        };
    }

    userDataCache[username].following_id = (userDataCache[username].following_id || []).concat(following_id);
    userDataCache[username].following_username = (userDataCache[username].following_username || []).concat(following_username);

    await saveUserData(userDataCache);
    return { username, following_id, following_username };
}

// Function to process multiple usernames sequentially
async function processUsernames(usernames) {
    const results = [];

    for (const username of usernames) {
        const result = await fetchAndSaveFollowing(username);
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

        // Filter usernames that do not already have following and following
        const usernamesToProcess = usernames.filter(username => 
            !userDataCache[username].following_username || 
            !userDataCache[username].following_id
        );

        // Process each filtered username to fetch following
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
