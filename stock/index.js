import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import NodeCache from 'node-cache';


dotenv.config();
const app = express();
const port = 3000;

// Initialize cache with 5-minute TTL
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Stock exchange API base URL
const STOCK_API_BASE = 'http://20.244.56.144/evaluation-service';

// Bearer token from environment variable
const BEARER_TOKEN = process.env.STOCK_API_TOKEN;

// Helper function to calculate average price
const calculateAveragePrice = (priceHistory) => {
    if (!priceHistory || priceHistory.length === 0) return 0;
    const sum = priceHistory.reduce((acc, curr) => acc + curr.price, 0);
    return sum / priceHistory.length;
};

// Helper function to fetch stock price history
const fetchStockPriceHistory = async (ticker, minutes) => {
    const cacheKey = `${ticker}:${minutes}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
        return cachedData;
    }

    try {
        const response = await axios.get(`${STOCK_API_BASE}/stocks/${ticker}?minutes=${minutes}`, {
            headers: {
                Authorization: `Bearer ${BEARER_TOKEN}`,
            },
        });
        const data = Array.isArray(response.data) ? response.data : [response.data.stock];
        cache.set(cacheKey, data);
        return data;
    } catch (error) {
        throw new Error(`Failed to fetch data for ${ticker}: ${error.message}`);
    }
};

// Helper function to align price histories by time
const alignPriceHistories = (history1, history2, minutes) => {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - minutes * 60 * 1000);

    // Filter prices within time window
    const filterByTime = (history) => history.filter(
        (entry) => {
            const entryTime = new Date(entry.lastUpdatedAt);
            return entryTime >= startTime && entryTime <= endTime;
        }
    );

    const filtered1 = filterByTime(history1);
    const filtered2 = filterByTime(history2);

    // Create aligned arrays by matching closest timestamps
    const aligned1 = [];
    const aligned2 = [];

    for (let entry1 of filtered1) {
        const time1 = new Date(entry1.lastUpdatedAt).getTime();
        let closest = null;
        let minDiff = Infinity;

        for (let entry2 of filtered2) {
            const time2 = new Date(entry2.lastUpdatedAt).getTime();
            const diff = Math.abs(time1 - time2);
            if (diff < minDiff) {
                minDiff = diff;
                closest = entry2;
            }
        }

        if (closest) {
            aligned1.push(entry1.price);
            aligned2.push(closest.price);
        }
    }

    return [aligned1, aligned2];
};

// Helper function to calculate Pearson's correlation coefficient
const calculateCorrelation = (prices1, prices2) => {
    if (prices1.length < 2 || prices2.length < 2) return 0;

    const n = prices1.length;
    const mean1 = prices1.reduce((sum, x) => sum + x, 0) / n;
    const mean2 = prices2.reduce((sum, y) => sum + y, 0) / n;

    // Calculate covariance
    let cov = 0;
    let stdDev1 = 0;
    let stdDev2 = 0;

    for (let i = 0; i < n; i++) {
        const diff1 = prices1[i] - mean1;
        const diff2 = prices2[i] - mean2;
        cov += diff1 * diff2;
        stdDev1 += diff1 * diff1;
        stdDev2 += diff2 * diff2;
    }

    cov /= (n - 1);
    stdDev1 = Math.sqrt(stdDev1 / (n - 1));
    stdDev2 = Math.sqrt(stdDev2 / (n - 1));

    if (stdDev1 === 0 || stdDev2 === 0) return 0;
    return cov / (stdDev1 * stdDev2);
};

// API 1: Average Stock Price
app.get('/stocks/:ticker', async (req, res) => {
    const { ticker } = req.params;
    const { minutes, aggregation } = req.query;

    if (aggregation !== 'average') {
        return res.status(400).json({ error: 'Invalid aggregation type. Use "average".' });
    }

    if (!minutes || isNaN(minutes) || minutes <= 0) {
        return res.status(400).json({ error: 'Invalid minutes parameter.' });
    }

    try {
        const priceHistory = await fetchStockPriceHistory(ticker, minutes);
        const averagePrice = calculateAveragePrice(priceHistory);

        res.json({
            averageStockPrice: averagePrice,
            priceHistory,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API 2: Stock Correlation
app.get('/stockcorrelation', async (req, res) => {
    const { minutes, ticker } = req.query;

    if (!minutes || isNaN(minutes) || minutes <= 0) {
        return res.status(400).json({ error: 'Invalid minutes parameter.' });
    }

    if (!ticker || !Array.isArray(ticker) || ticker.length !== 2) {
        return res.status(400).json({ error: 'Exactly two tickers are required.' });
    }

    const [ticker1, ticker2] = ticker;

    try {
        const [history1, history2] = await Promise.all([
            fetchStockPriceHistory(ticker1, minutes),
            fetchStockPriceHistory(ticker2, minutes),
        ]);

        const [alignedPrices1, alignedPrices2] = alignPriceHistories(history1, history2, minutes);
        const correlation = calculateCorrelation(alignedPrices1, alignedPrices2);

        res.json({
            correlation,
            stocks: {
                [ticker1]: {
                    averagePrice: calculateAveragePrice(history1),
                    priceHistory: history1,
                },
                [ticker2]: {
                    averagePrice: calculateAveragePrice(history2),
                    priceHistory: history2,
                },
            },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});