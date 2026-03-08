import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth';

const router = Router();

// Route to get weather data for Dhaka
router.get('/weather/dhaka', isAuthenticated, async (req, res) => {
  try {
    // In a production environment, this would call a real weather API
    // For now, we're returning mock data for Dhaka
    const weatherData = {
      city: "Dhaka",
      country: "Bangladesh",
      temp: 32,
      condition: "Partly Cloudy",
      forecast: [
        { day: "Today", temp: 32, condition: "Partly Cloudy", icon: "sun" },
        { day: "Tomorrow", temp: 33, condition: "Sunny", icon: "sun" }
      ],
      humidity: 70,
      windSpeed: 12
    };
    
    res.json(weatherData);
  } catch (error) {
    console.error('Error fetching weather data:', error);
    res.status(500).json({ message: 'Error fetching weather data' });
  }
});

export default router;