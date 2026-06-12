const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');
const app = express();

app.use(express.json()); // Allows parsing Dialogflow's JSON requests

// Helper function to scan the CSV file for a specific match_id
const findMatchInCSV = (matchId) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream('matches.csv')
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        // Look for the row where match_id matches the user's input
        const match = results.find(row => row.match_id.trim().toUpperCase() === matchId.trim().toUpperCase());
        resolve(match);
      })
      .on('error', (err) => reject(err));
  });
};

// Main webhook route
app.post('/webhook', async (req, res) => {
  const body = req.body;
  const parameters = body.sessionInfo?.parameters || {};
  const fulfillmentTag = body.fulfillmentInfo?.tag;
  const matchId = parameters.match_id;

  let responseText = "I couldn't look that up in my records.";

  if (!matchId) {
    responseText = "Please provide a valid match ID (e.g., MATCH_01).";
  } else {
    try {
      const matchData = await findMatchInCSV(matchId);

      if (!matchData) {
        responseText = `I couldn't find any information for match ID ${matchId}.`;
      } else {
        // Condition 1: User wants schedule details
        if (fulfillmentTag === 'get_schedule') {
          responseText = `${matchData.team_1} vs ${matchData.team_2} is scheduled for ${matchData.date} at ${matchData.time_et} ET. Venue: ${matchData.stadium} in ${matchData.city}.`;
        } 
        // Condition 2: User wants ticketing details
        else if (fulfillmentTag === 'get_tickets') {
          responseText = `Tickets for Match ${matchId} are currently ${matchData.status}. Category 1 is $${matchData.cat1_price} (${matchData.cat1_available} left). Category 2 is $${matchData.cat2_price} (${matchData.cat2_available} left).`;
        }
      }
    } catch (error) {
      console.error(error);
      responseText = "An error occurred while scanning the local spreadsheet database.";
    }
  }

  // Send the structured format required by Dialogflow CX
  res.status(200).json({
    fulfillmentResponse: {
      messages: [{ text: { text: [responseText] } }]
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook server listening on port ${PORT}`));
