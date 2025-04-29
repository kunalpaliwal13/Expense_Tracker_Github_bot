const { Client, GatewayIntentBits } = require('discord.js');
const { google } = require('googleapis');
const fs = require('fs');
require('dotenv').config();
const categoryMap = require('./category');
const BUDGET_FILE = './budgets.json';


//client connection
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

//loading budget
function loadBudgets() {
    try {
      const data = fs.readFileSync(BUDGET_FILE, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Error reading budgets.json:', err);
      return {};
    }
  }

//saving budget
function saveBudgets(budgets) {
  try {
    fs.writeFileSync(BUDGET_FILE, JSON.stringify(budgets, null, 2));
  } catch (err) {
    console.error('Error saving to budgets.json:', err);
  }
}

let userBudgets = loadBudgets(); 

//google sheet connect
const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

//spreadsheet id
const SPREADSHEET_ID = ''; // extract from sheet URL

let sheets; 

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});



client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
  
    // Match natural expense messages like "200 swiggy", "spent 300 on food"
    const expenseRegex = /(?:spent\s*)?(\d+(?:\.\d{1,2})?)\s*(?:on\s*)?([a-zA-Z\s]+)/i;
    const match = message.content.match(expenseRegex);
    const clientAuth = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: clientAuth });

    // How much did i spend today
    if (message.content.toLowerCase().includes('how much did i spend today')) {
        const total = await getTodaySpending(message.author.username);
        message.reply(`You spent ₹${total.toFixed(2)} today.`);
        return;}

    //summary
    if (message.content.toLowerCase().trim() === '!summary') {
        const summaryMap = await getFullSummary(message.author.username);
        
        if (Object.keys(summaryMap).length === 0) {
          message.reply("No spending records found.");
          return;
        }
      
        let summaryMessage = "You spent:\n";
        for (const [category, total] of Object.entries(summaryMap)) {
          summaryMessage += `- ₹${total.toFixed(2)} on ${category}\n`;
        }
      
        message.reply(summaryMessage);
      }

    //budget
    if (message.content.toLowerCase().startsWith('!setbudget')) {
      const [, amountStr] = message.content.split(' ');
      const amount = parseFloat(amountStr);
    
      if (isNaN(amount)) {
        return message.reply('❌ Invalid budget amount. Usage: `!setbudget 5000`');
      }
    
      userBudgets[message.author.username] = amount;
      saveBudgets(userBudgets);  // Persist to file
      message.reply(`✅ Budget of ₹${amount} has been set for you.`);
      return;
    }
          
    //reset budget
    if (message.content.toLowerCase().startsWith('!deletebudget') || message.content.toLowerCase().startsWith('!resetbudget')) {
        if (userBudgets[message.author.username]) {
          delete userBudgets[message.author.username];
          saveBudgets(userBudgets);  
          message.reply('🗑️ Your budget has been deleted.');
        } else {
          message.reply('⚠️ You don’t have a budget set.');
        }
        return;
      }
      
      // How much did i spend on a specific category like 'food'
    if (message.content.toLowerCase().startsWith('how much did i spend on')) {
        const categoryArg = message.content.split('on ')[1].trim().toLowerCase();
        const categoryTotal = await getCategorySummary(message.author.username, categoryArg);
        message.reply(`You spent ₹${categoryTotal.toFixed(2)} on "${categoryArg}".`);
        return;
    }

    if (match) {
      const amount = match[1];
      let rawInput = match[2].trim().toLowerCase();
      let category = 'misc';

        // Check for #category format
      const tagMatch = rawInput.match(/#(\w+)/);
      if (tagMatch) {
        category = tagMatch[1];
      } else {
        // Smart keyword-based detection
        for (const keyword in categoryMap) {
          if (rawInput.includes(keyword)) {
            category = categoryMap[keyword];
            break;
          }
        }
      }

      //input the entry to sheets
      const timestamp = new Date().toISOString();
      const values = [[message.author.username, category, amount, rawInput, timestamp]];
      try {
        sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: 'Sheet1!A1',
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          resource: { values },
        });
        message.reply(`Logged ₹${amount} for "${category}"`);

        //budget management
        const totalSpent = await getTotalSpent(message.author.username);
        const userBudget = userBudgets[message.author.username];
        if (userBudget && totalSpent > 0.8 * userBudget) {
          message.reply(`⚠️ Heads up! You've spent more than 80% of your budget (₹${userBudget}). Total so far: ₹${totalSpent.toFixed(2)}.`);
        }


      } catch (error) {
        console.error('Error logging to sheet:', error);
        message.reply('There was an error logging that expense.');
      }
    }
  });
  

  async function getTodaySpending(username) {
    const clientAuth = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: clientAuth });
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A2:E',  
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) return 0;

    const today = new Date().toISOString().slice(0, 10);

    let total = 0;
    for (const row of rows) {
        const [user, , amount, , timestamp] = row; 
        if (user === username && timestamp) {
            const rowDate = timestamp.slice(0, 10);
            if (rowDate === today) {
                total += parseFloat(amount);
            }
        }
    }

    console.log(`Today's total for ${username}: ₹${total}`);
    return total;
}


async function getFullSummary(username) {
    const clientAuth = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: clientAuth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A2:C', 
    });
  
    const rows = res.data.values;
    if (!rows || rows.length === 0) return {};
  
    const summary = {};
    for (const [user, category, amount] of rows) {
      if (user === username) {
        const cat = category.toLowerCase();
        summary[cat] = (summary[cat] || 0) + parseFloat(amount);
      }
    }
  
    return summary;
  }
  
  
  async function getTotalSpent(username) {
    const clientAuth = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: clientAuth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A2:E',
    });
  
    const rows = res.data.values;
    if (!rows || rows.length === 0) return 0;
  
    let total = 0;
    for (const [user, , amount] of rows) {
      if (user === username) {
        total += parseFloat(amount);
      }
    }
    return total;
  }
  
  
  













client.login(process.env.CLIENT_TOKEN);





//
// !expense = trigger bot
