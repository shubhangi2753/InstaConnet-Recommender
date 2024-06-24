const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const app = express();

const uri = 'mongodb://localhost:27017/';
const client = new MongoClient(uri);
const dbName = 'recommender_system';

async function connectToDB() {
    await client.connect();
    console.log('Connected successfully to MongoDB server');
}

app.use(express.json());

const flattenDocument = (doc) => {
    const flattened = [];
    for (const key in doc) {
        if (typeof doc[key] === 'object' && !Array.isArray(doc[key]) && doc[key] !== null) {
            const flattenedDoc = { ...doc[key], username: key };
            flattened.push(flattenedDoc);
        }
    }
    return flattened;
};

app.get('/flatten', async (req, res) => {
    const db = client.db(dbName);
    const collection = db.collection('users');
    const flattenedCollection = db.collection('flattened_recommendation');

    try {
        const allDocs = await collection.find().toArray();
        const flattenedDocs = allDocs.flatMap(flattenDocument);

        // Log the documents to ensure they are correctly formatted
        console.log('Flattened Documents:', JSON.stringify(flattenedDocs, null, 2));

        await flattenedCollection.deleteMany({});
        await flattenedCollection.insertMany(flattenedDocs);

        res.send('Documents flattened and inserted into the new collection');
    } catch (error) {
        console.error('Error during flattening documents:', error);
        res.status(500).send('Error during flattening documents');
    }
});
app.get('/common-followers', async (req, res) => {
    const db = client.db(dbName);
    const flattenedCollection = db.collection('flattened_recommendation');

    const commonFollowersPipeline = [
        { $unwind: '$followers_id' },
        { $group: { _id: '$followers_id', followers: { $push: '$username' } } },
        { $match: { $expr: { $gte: [{ $size: '$followers' }, 2] } } },
        {
            $lookup: {
                from: 'flattened_recommendation',
                localField: '_id',
                foreignField: 'followers_id',
                as: 'follower_details'
            }
        },
        {
            $project: {
                _id: 0,
                common_followers: {
                    $map: {
                        input: '$follower_details',
                        as: 'follower',
                        in: '$$follower.username'
                    }
                },
                common_followers_count: { $size: '$followers' }
            }
        }
    ];

    try {
        const commonFollowers = await flattenedCollection.aggregate(commonFollowersPipeline).toArray();
        res.json(commonFollowers);
    } catch (error) {
        console.error('Error during common followers aggregation:', error);
        res.status(500).send('Error during common followers aggregation');
    }
});

app.get('/recommendations', async (req, res) => {
    const db = client.db(dbName);
    const flattenedCollection = db.collection('flattened_recommendation');

    const commonFollowersPipeline = [
        { $unwind: '$followers_id' },
        { $group: { _id: '$followers_id', followers: { $push: '$username' } } },
        { $match: { $expr: { $gte: [{ $size: '$followers' }, 2] } } },
        {
            $lookup: {
                from: 'flattened_recommendation',
                localField: 'followers',
                foreignField: 'username',
                as: 'common_followers'
            }
        },
        {
            $project: {
                _id: 0,
                'common_followers.username': 1,
                'common_followers.followerCount': 1,
                'common_followers.followingCount': 1
            }
        }
    ];

    const commonFollowingsPipeline = [
        { $unwind: '$following_id' },
        { $group: { _id: '$following_id', followings: { $push: '$username' } } },
        { $match: { $expr: { $gte: [{ $size: '$followings' }, 2] } } },
        {
            $lookup: {
                from: 'flattened_recommendation',
                localField: 'followings',
                foreignField: 'username',
                as: 'common_followings'
            }
        },
        {
            $project: {
                _id: 0,
                'common_followings.username': 1,
                'common_followings.followerCount': 1,
                'common_followings.followingCount': 1
            }
        }
    ];

    const commonFollowers = await flattenedCollection.aggregate(commonFollowersPipeline).toArray();
    const commonFollowings = await flattenedCollection.aggregate(commonFollowingsPipeline).toArray();

    let recommendations = {};

    commonFollowers.forEach(res => {
        res.common_followers.forEach(user => {
            recommendations[user.username] = (recommendations[user.username] || 0) + 1;
        });
    });

    commonFollowings.forEach(res => {
        res.common_followings.forEach(user => {
            recommendations[user.username] = (recommendations[user.username] || 0) + 1;
        });
    });

    const sortedRecommendations = Object.entries(recommendations).sort((a, b) => b[1] - a[1]);

    res.json(sortedRecommendations.map(([username, score]) => ({ username, score })));
});

app.get('/users/:keyword', async (req, res) => {
    const db = client.db(dbName);
    const flattenedCollection = db.collection('flattened_recommendation');
    const keyword = req.params.keyword;

    try {
        const users = await flattenedCollection.find({ bio: keyword }, { projection: { username: 1, _id: 0 } }).toArray();
        res.json(users);
    } catch (error) {
        console.error('Error during user search:', error);
        res.status(500).send('Error during user search');
    }
});


connectToDB().catch(console.error);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
