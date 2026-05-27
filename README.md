# Daily Excel Tips by XLClick

A GitHub Action that delivers one Excel productivity tip per day to a Telegram chat or channel — automatically, every morning.

Tips are sourced from [XLClick.com](https://xlclick.com) and stored directly in this repository (`data/tips.csv`), so the action works with no external API calls beyond Telegram.

---

## What you get

Every day at 09:00 UTC your chat receives a message like this:

```
💡 Excel Tip of the Day

🔧 Split to Rows

Our most loved feature: converts a single cell with multiple values
into separate rows. This tool splits delimited text into new rows while
duplicating adjacent data. It processes your selected column and outputs
the reorganized results onto a new sheet.

📖 Full tutorial →  https://xlclick.com/tutorials/split-cells-rows-excel/
```

The tip rotates daily through all 34 tips in the database, cycling continuously.

---

## Setup

### 1. Fork this repository

Click **Fork** at the top-right of this page. All tips and the workflow are included — nothing extra to install.

### 2. Create a Telegram bot

1. Open Telegram and start a chat with [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the prompts.
3. Copy the **API token** you receive (looks like `123456789:ABCdef...`).

### 3. Get your chat ID

**Personal chat:**
- Start a conversation with your new bot (send any message to it).
- Open this URL in your browser, replacing `YOUR_TOKEN` with your bot token:
  ```
  https://api.telegram.org/botYOUR_TOKEN/getUpdates
  ```
- Find `"chat":{"id":` in the response — that number is your chat ID.

**Channel:**
- Add the bot as an **administrator** of your channel.
- Use the channel username as the chat ID (e.g. `@myexcelchannel`).

### 4. Add secrets to your forked repository

Go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret name    | Value                              |
|----------------|------------------------------------|
| `TELEGRAM_KEY` | Your Telegram bot API token        |
| `CHAT_ID`      | Your chat ID or `@channelname`     |

### 5. Enable Actions

Go to the **Actions** tab in your forked repo and click **"I understand my workflows, go ahead and enable them"** if prompted.

The workflow runs automatically at 09:00 UTC every day. You can also trigger it manually any time from the **Actions** tab → **Daily XLClick Tip** → **Run workflow**.

---

## Customizing the schedule

Edit [`.github/workflows/daily-tip.yml`](.github/workflows/daily-tip.yml) and change the cron expression:

```yaml
- cron: '0 9 * * *'   # 09:00 UTC every day
```

Common examples:

| Cron expression | Fires at              |
|-----------------|-----------------------|
| `0 7 * * *`     | 07:00 UTC             |
| `0 8 * * 1-5`   | 08:00 UTC, Mon–Fri    |
| `0 17 * * *`    | 17:00 UTC (5 PM)      |

Use [crontab.guru](https://crontab.guru) to build your own expression.

---

## Adding or editing tips

All tips live in [`data/tips.csv`](data/tips.csv) (semicolon-separated). To add a new tip, append a row following this format:

```
id;title;descr;post-slug;functionality;description
34;My New Tip Title;Short meta description.;https://example.com/tutorial/;Short Label;Full description shown in the Telegram message.
```

Fields that contain semicolons or double-quotes must be wrapped in double-quotes, with internal double-quotes escaped as `""` (standard CSV quoting).

---

## Using this action from another repository

You can reference this action directly in any workflow:

```yaml
- uses: YOUR_USERNAME/daily-xlclick-tip@v1
  with:
    telegram_key: ${{ secrets.TELEGRAM_KEY }}
    chat_id: ${{ secrets.CHAT_ID }}
```

> Replace `YOUR_USERNAME` with your GitHub username after forking.

---

## Running tests locally

```bash
node src/index.test.js
```

No dependencies required — the test uses only built-in Node.js modules.

---

## License

MIT
