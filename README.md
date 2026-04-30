# BreatheOS

BreatheOS is a breathing and cardiovascular wellness app I built to make breath training feel calm, focused, and a little more personal than a normal timer app.

It combines guided breathing sessions, blood pressure logs, sleep sounds, session history, and a real-time "Breathe Together" room feature.

Built by **Godstime Aburu**
GitHub: [BBoyGT](https://github.com/BBoyGT)

---

## Why I Built This

I wanted BreatheOS to feel like a quiet space for training your breathing habits, not just another dashboard full of numbers.

The app focuses on:

- Lower blood pressure breathing routines
- Lung capacity training
- Breath-hold practice
- Sleep sounds for winding down
- Tracking progress over time
- Breathing together with someone else in real time

This is not a medical device and it is not medical advice. It is a wellness tool for guided breathing, habit tracking, and relaxation.

---

## About The Sounds

The sleep sounds in this project are generated with the **Web Audio API**. That means the app creates ambient sounds like rain, water, wind, fire, and atmosphere in the browser instead of shipping downloaded audio files.

About using YouTube sounds:

- Do not download and use random YouTube sounds unless you own them or have permission.
- Even if a sound is on YouTube, it is usually still copyrighted.
- If you want real audio files later, use royalty-free or properly licensed sources.
- Good options are YouTube Audio Library, Pixabay, Freesound, or your own recordings.
- Always check whether attribution is required.

For now, the safest path is keeping the procedural Web Audio sounds already in the project.

---

## Features

- Guided breathing sessions with progressive programs
- Training goals for Lower BP, Lung, and Breath Hold
- Blood pressure logging and charts
- Session history calendar
- Streak and completion stats
- Sleep sounds with duration and volume controls
- Crossfading sound engine
- Breathe Together rooms using WebSockets
- Magic-link authentication with NextAuth
- Prisma database support
- Mobile-first layout with desktop support
- PWA-ready structure

---

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Framer Motion
- Prisma
- NextAuth
- Web Audio API
- WebSocket server with `ws`
- shadcn/Radix UI components

---

## Getting Started

Clone the project:

```bash
git clone https://github.com/BBoyGT/BreathOS.git
cd BreathOS
```

Install dependencies:

```bash
npm install
```

Set up environment variables:

```bash
cp .env.example .env.local
```

Update `.env.local` with your own values.

Example:

```env
DATABASE_URL="file:./db/breatheos.db"
NEXTAUTH_URL="http://localhost:3333"
NEXTAUTH_SECRET="replace-this-with-a-real-secret"

EMAIL_SERVER_HOST="smtp.example.com"
EMAIL_SERVER_PORT="587"
EMAIL_SERVER_USER="your-email-user"
EMAIL_SERVER_PASSWORD="your-email-password"
EMAIL_FROM="BreatheOS <noreply@example.com>"

NEXT_PUBLIC_WS_URL="ws://localhost:4001"
```

Push the Prisma schema:

```bash
npm run db:push
```

Run the app:

```bash
npm run dev
```

The app runs at:

```text
http://localhost:3333
```

---

## Running Breathe Together

The Breathe Together feature needs the WebSocket server.

Run the app and WebSocket server together:

```bash
npm run dev:full
```

Or run them separately:

```bash
npm run dev
```

```bash
npm run ws
```

Default WebSocket URL:

```text
ws://localhost:4001
```

---

## Useful Scripts

```bash
npm run dev
```

Starts the Next.js development server on port `3333`.

```bash
npm run build
```

Builds the production version.

```bash
npm run start
```

Starts the production server.

```bash
npm run db:push
```

Pushes the Prisma schema to the database.

```bash
npm run db:generate
```

Regenerates the Prisma client.

```bash
npm run ws
```

Starts the WebSocket server for Breathe Together.

---

## Project Structure

```text
BreathOS/
|-- prisma/
|   `-- schema.prisma
|-- public/
|-- src/
|   |-- app/
|   |   |-- api/
|   |   |-- auth/
|   |   |-- globals.css
|   |   |-- layout.tsx
|   |   `-- page.tsx
|   |-- components/
|   |   |-- breatheos/
|   |   |   |-- index.tsx
|   |   |   |-- bp-chart.tsx
|   |   |   `-- nature-sound.ts
|   |   `-- ui/
|   `-- lib/
|-- ws-server.cjs
|-- package.json
`-- README.md
```

---

## Notes For Deployment

Before deploying:

- Set a real `NEXTAUTH_SECRET`
- Use production email credentials
- Set `NEXTAUTH_URL` to your deployed URL
- Use a production database if needed
- Deploy the WebSocket server separately if you want Breathe Together online
- Keep `.env` and `.env.local` out of GitHub

---

## License And Sound Usage

The app currently uses generated sounds, not copied YouTube audio.

If real sound files are added later, they should only come from sources that allow use in projects like this. Add attribution in this README if the license requires it.

---

## Author

Built by **Godstime Aburu**
GitHub: [BBoyGT](https://github.com/BBoyGT)

I built this as a personal wellness project around breathing, focus, and cardiovascular habit tracking.
