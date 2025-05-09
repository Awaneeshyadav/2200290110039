import express from "express";
import axios from "axios";
import dotenv from 'dotenv';
import cookieParser from "cookie-parser";


dotenv.config();

const port = 9876;
const windowSize = 10;
const reqTimeout = 500;
const ids = ['p', 'f', 'e', 'r'];
const endpoints = {
    p: 'http://20.244.56.144/evaluation-service/primes',
    f: 'http://20.244.56.144/evaluation-service/fibo',
    e: 'http://20.244.56.144/evaluation-service/even',
    r: 'http://20.244.56.144/evaluation-service/rand'
};

let numWindow = [];

const calculateAverage = (numbers) => {
    if (numbers.length === 0) return 0;
    const sum = numbers.reduce((acc, num) => acc + num, 0);
    return Number((sum / numbers.length).toFixed(2));
};

const updateWindow = (newNumbers) => {
    for (const num of newNumbers) {
        if (!numWindow.includes(num)) {
            numWindow.push(num);
        }
    }

    if (numWindow.length > windowSize) {
        numWindow = numWindow.slice(numWindow.length - windowSize);
    }
};

const app = express();
app.use(express.json());
app.use(cookieParser());

app.get('/numbers/:numberid', async (req, res) => {

    try {
        const { numberid } = req.params;

        if (!ids.includes(numberid)) {
            return res.status(400).json({
                error: 'Invalid number ID'
            });
        }
    
        const windowPrevState = [...numWindow];
        const response = await axios.get(endpoints[numberid], {
            timeout: reqTimeout,
            headers: {
                Authorization: `Bearer ${process.env.AUTH}`
                
            }
        });
        
        const numbers = response.data.numbers || [];
        updateWindow(numbers);

        const avg = calculateAverage(numWindow);

        const responseBody = {
            windowPrevState,
            windowCurrState: numWindow,
            numbers,
            avg
        };

        res.json(responseBody);
    } catch (error) {
        res.status(500).json({
            message: 'Internal Server Error'
        });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});