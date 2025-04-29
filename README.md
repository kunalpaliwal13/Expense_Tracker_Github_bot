# 💸 Discord Expense Tracker Bot

Track your daily expenses directly from Discord using smart natural language inputs. This bot logs your spending into a Google Sheet with your name, category, amount, and timestamp.

---

## ✨ Features

- 📥 Log expenses with messages like:
  - `300 swiggy spent`
  - `spent 500 on food`
- 🧠 Smart category detection (e.g., swiggy → food, ola → transport)
- 📊 Query total spent with:
  - `How much did I spend today?`
- 📁 Data saved to Google Sheets in the format:  
  **Name | Category | Amount | Timestamp**

---

## 🚀 Tech Stack

- discord.js
- Google Sheets API

---

## 🔧 Setup Instructions

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/discord-expense-bot.git
cd discord-expense-bot
