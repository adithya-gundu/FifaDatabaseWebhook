const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');
const app = express();

app.use(express.json());

// Helper function to scan the CSV file and look for matching teams or cities
const searchMatchesInCSV = (team, city) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream('matches.csv')
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        const filtered = results.filter(row => {
          let matchFound = true;
          
          // Check if user specified a team and if it matches team_1 or team_2
          if (team) {
            const targetTeam = team.trim().toLowerCase();
            const t1 = row.team_1?.trim().toLowerCase() || "";
            const t2 = row.team_2?.trim().toLowerCase() || "";
            if (!t1.includes(targetTeam) && !t2.includes(targetTeam)) {
              matchFound = false;
            }
          }
          
          // Check if user specified a host city and if it matches the city column
          if (city) {
            const targetCity = city.trim().toLowerCase();
            const matchCity = row.city?.trim().toLowerCase() || "";
            if (!matchCity.includes(targetCity)) {
              matchFound = false;
            }
          }
          
          return matchFound;
        });
        
        resolve(filtered);
      })
      .on('error', (err) => reject(err));
  });
};

// Main webhook route
app.post('/webhook', async (req, res) => {
  const body = req.body;
  
  // Dialogflow CX passes active Form/Page parameters straight into sessionInfo.parameters
  const parameters = body.sessionInfo?.parameters || {};
  const fulfillmentTag = body.fulfillmentInfo?.tag;

  const teamParam = parameters.required_team; // From @Fifa-team
  const cityParam = parameters.required_city; // From @host-city

  let responseText = "I couldn't look that up in my tournament records.";

  try {
    // Make sure the user provided at least one search metric
    if (!teamParam && !cityParam) {
      responseText = "Please tell me which team or host city schedule you'd like to check out!";
    } else if (fulfillmentTag === 'get_schedule') {
      
      const foundMatches = await searchMatchesInCSV(teamParam, cityParam);

      if (foundMatches.length === 0) {
        responseText = `I couldn't find any upcoming fixtures matching your search criteria.`;
      } else {
        // Build a conversational text list of matching fixtures (Max 3 items to avoid cluttering chat)
        let scheduleLines = foundMatches.slice(0, 3).map(match => {
          return `• Match ${match.match_id}: ${match.team_1} vs ${match.team_2} on ${match.date} at ${match.time_et} ET in ${match.city} (${match.stadium})`;
        });

        let headerText = "Here are the upcoming tournament fixtures I found:\n";
        if (teamParam && cityParam) headerText = `Here is the schedule for ${teamParam} playing in ${cityParam}:\n`;
        else if (teamParam) headerText = `Here are the upcoming matches for ${teamParam}:\n`;
        else if (cityParam) headerText = `Here are the upcoming matches taking place in ${cityParam}:\n`;

        responseText = headerText + scheduleLines.join('\n');
      }
    }
  } catch (error) {
    console.error(error);
    responseText = "An error occurred while scanning the local spreadsheet dataset.";
  }

  // Return formatted array to Dialogflow
  res.status(200).json({
    fulfillmentResponse: {
      messages: [{ text: { text: [responseText] } }]
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Fifa CSV Webhook running on port ${PORT}`));
