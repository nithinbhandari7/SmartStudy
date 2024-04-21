const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const axios = require('axios');
const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: "sk-proj-7VGSFFodMB03C8eHHzekT3BlbkFJWM4U9y22zmONJJtvzjQg",
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'views')));
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

mongoose.connect('mongodb://localhost:27017/test');

const flashcardSetSchema = new mongoose.Schema({
    name: String,
    flashcards: [{
        front: String,
        back: String
    }],
    index: Number,
    creationDate: { type: Date, default: Date.now }
});


const FlashcardSet = mongoose.model('FlashcardSet', flashcardSetSchema);

app.get('/', async (req, res) => {
    try {
        const flashcardSets = await FlashcardSet.find();
        console.log('Flashcard Sets at Home:', flashcardSets);
        res.render('home', { flashcardSets });
    } catch (error) {
        console.error('Error fetching flashcard sets:', error);
        res.status(500).send('Error fetching flashcard sets');
    }
});

app.get('/display-data', async (req, res) => {
    try {
        const setId = req.query.setId;
        console.log('Flashcard Set ID in display:', setId);
        const flashcardSet = await FlashcardSet.findById(setId).populate('flashcards');
        console.log('Flashcard Sets in Display Data:', flashcardSet);
        res.render('display', { flashcardSet });
    } catch (err) {
        console.error('Error fetching flashcard set data:', err);
        res.status(500).send('Error fetching flashcard set data');
    }
});

app.post('/create-set', async (req, res) => {
    try {
        const newIndex = await FlashcardSet.countDocuments() + 1;
        const newSet = await FlashcardSet.create({ name: 'Untitled', index: newIndex });
        console.log(newIndex);
        //res.redirect(`/display-data/${newSet._id}`);
        res.redirect(`/display-data?setId=${newSet._id}`);
    } catch (err) {
        console.error('Error creating flashcard set:', err);
        res.status(500).send('Error creating flashcard set');
    }
});

app.post('/modify-set-name/:setId', async (req, res) => {
    try {
        const setId = req.params.setId;
        const newName = req.body.newName;
        await FlashcardSet.findByIdAndUpdate(setId, { name: newName });
        res.redirect('/');
    } catch (err) {
        console.error('Error modifying set name:', err);
        res.status(500).send('Error modifying set name');
    }
});

app.post('/delete-set/:setId', async (req, res) => {
    const setId = req.params.setId;
    try {
        await FlashcardSet.findByIdAndDelete(setId);
        res.redirect('/');
    } catch (err) {
        console.error('Error deleting set:', err);
        res.status(500).send('Error deleting set');
    }
});

app.post('/create-flashcard/:setId', async (req, res) => {
    const front = req.body.front;
    const back = req.body.back;
    const setId = req.params.setId;
    
    try {
        const newFlashcard = {
            front: front,
            back: back
        };
        await FlashcardSet.findByIdAndUpdate(setId, { $push: { flashcards: {front: front , back: back} } }, { new: true });

        const flashcardSet = await FlashcardSet.findById(setId).populate('flashcards');
        console.log('Flashcard Sets in Create Flashcard:', flashcardSet);

        res.redirect(`/display-data?setId=${setId}`);
    } catch (err) {
        console.error('Error deleting set:', err);
        res.status(500).send('Error creating flashcard');
    }
});

app.post('/delete-flashcard/:id/:setId', async (req, res) => {
    const bodyKeys = Object.keys(req.body);
    const setId = req.params.setId;
    const front = bodyKeys[0];
    const back = bodyKeys[1];

    try {
        await FlashcardSet.findByIdAndUpdate(setId, { $pull: { flashcards: {front: front , back: back} } }, { new: true });
        res.redirect(`/display-data?setId=${setId}`);
    } catch (err) {
        res.status(500).send('Error deleting flashcard');
    }
});

app.get('/load', async (req, res) => {
    const setId = req.query.setId;
    const card = req.query.card;
    console.log('New checker: ', card);
    const flashcardSet = await FlashcardSet.findById(setId).populate('flashcards');
    res.render('review', { flashcardSet, card});
});

app.post('/new-card/:setId', async (req, res) => {
    const setId = req.params.setId;
    const flashcardSet = await FlashcardSet.findById(setId).populate('flashcards');
    const cards = flashcardSet.flashcards;
    const randomIndex = Math.floor(Math.random() * cards.length)
    const card = cards[randomIndex].front;
    res.redirect(`/load?setId=${setId}&card=${card}`);
});

app.post('/flip/:setId/:card', async (req, res) => {
    const setId = req.params.setId;
    var card = req.params.card;
    console.log(`(${req.params.card})`);
    console.log(`(${card})`);
    const flashcardSet = await FlashcardSet.findById(setId).populate('flashcards');
    const cards = flashcardSet.flashcards;
    var reverse = '';
    for (let i = 0; i < cards.length; i++) {
        console.log(`front: ${cards[i].front} back: ${cards[i].back} card: ${card}`);
        if(cards[i].front === card) {
            console.log('Success 1');
            reverse = cards[i].back;
            break;
        } else if(cards[i].back === card) {
            console.log('Success 1');
            reverse = cards[i].front;
            break;
        }
    }
    card = reverse;
    res.redirect(`/load?setId=${setId}&card=${card}`);
});

app.post('/create-ai-set', async (req, res) => {
    try {
        const number = req.body.number;
        const prompt = req.body.prompt;
        console.log(`make me flashcards (only front and back in the format front: and back: ) on the topic: ${prompt}`);

        const fullPrompt = `give me strictly (${number}) the front and back of flashcards in the topic of (${prompt}) in the exact format of only Front: (front) and Back: (back), no other information, where the front should always be the question and the back is the answer`
   
        const response = await openai.chat.completions.create({
            messages: [{ role: "user", content: fullPrompt }],
            model: "gpt-3.5-turbo",
            max_tokens: 2048,
        });
        console.log(response.choices[0].message.content);

        const flashcards = response.choices[0].message.content.split('\n\n');
        console.log(flashcards);

        const newIndex = await FlashcardSet.countDocuments() + 1;
        const newSet = await FlashcardSet.create({ name: prompt, index: newIndex });
        const setId = newSet._id;

        for (const card of flashcards) {
            const [front, back] = card.split('\n');
            const cleanedFront = front.replace('Front: ', '').trim();
            const cleanedBack = back.replace('Back: ', '').trim();
            
            await FlashcardSet.findByIdAndUpdate(setId, { $push: { flashcards: {front: cleanedFront , back: cleanedBack} } }, { new: true });
            
        }

        const flashcardSet = await FlashcardSet.findById(setId).populate('flashcards');
        console.log('Flashcard Sets in Create Flashcard:', flashcardSet);

        res.redirect(`/display-data?setId=${setId}`);

    } catch (err) {
        console.error('Error with ai set:', err);
        res.status(500).send('Error with ai set');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});