# Demo walkthrough

Cue's demo is a sample student's semester at the University of Toronto, two weeks before midterms. It opens at 10:12 on Tuesday of the current week, the moment the sample was written for, and the clock runs forward from there.

## Start the demo

- Open https://learn-with-cue.vercel.app. A browser that has never opened Cue starts the demo on its own.
- To start a fresh take, open https://learn-with-cue.vercel.app/?demo. It reloads the sample and resets the clock to Tuesday 10:12.
- **Data → Exit demo** returns to the real clock. **Data → Reset all data** shows the empty first-run screen.

Everything is stored in the browser, so each browser gets its own copy. The AI features call NVIDIA Nemotron on Nebius Token Factory live.

## Files to upload

Download these from the repository before recording:

- [timetable.png](https://github.com/adnjkm/cue/raw/main/scripts/fixtures/calendar/timetable.png). A timetable screenshot with two new courses, PHL100 and BIO130, and two key dates.
- [sample-quiz.pdf](https://github.com/adnjkm/cue/raw/main/scripts/fixtures/practice/sample-quiz.pdf). A CSC148 multiple-choice paper with a code question, a tree diagram and an answer key that skips question 4.
- [eco101-lecture8-slides.pdf](https://github.com/adnjkm/cue/raw/main/scripts/fixtures/guides/eco101-lecture8-slides.pdf). Three ECO101 slides to add to the study guide.

## The walkthrough

The order follows one student's morning. Each step names what to click and the point it makes.

### 1. Today

The brief reads "Two sessions today. Start with recursion." Cue moved the CSC148 review up because the midterm is in 10 days.

- The next-up card already holds Lecture 8 slides, the Lecture 8 transcript, the Lab 6 handout and 12 practice questions.
- The day list mixes classes, study blocks and the student's café shift. Cue plans around the student's life, not only the courses.

### 2. Calendar

The week shows every study block placed around lectures, shifts and plans: review after each lecture, mid-week reviews, test prep before Term Test 2.

- Click **Add schedule**, upload `timetable.png`. Nemotron 3.5 Super VL reads the screenshot and lists PHL100 and BIO130 with their meeting times.
- Click **Add 2 courses**. The toast says how many study blocks Cue planned. Click **Undo** to keep the demo week clean.

### 3. A study session

From Today, click **Start session** on the CSC148 review.

- The Pomodoro timer, the session plan and the Lecture 8 slides are already open at the right slide.
- Open **Transcript**: it jumps to the moment the professor explained postorder.
- Ask "Why does deleting a tree use postorder?" in **Quick**, then the same in **Deep**. Answers cite the slide and the transcript moment. Click a citation to open it.
- Click **Add to study guide** on the answer.

### 4. Lecture notes

Open **Lecture notes**, then MAT137 Lecture 15, Integration by parts.

- The saved notes show a summary, the flagged exam hint "on Term Test 2", key points and the student's questions.
- Go back and click **Record a lecture**, pick MAT137, start. The sample replays a recorded lecture, so no microphone or model download is needed. Lines appear live, Nemotron cleans them, and a hint like "this will be on the test" gets flagged.
- Ask "What did she just say about choosing u?" The answer uses the last five minutes.
- Click **End and save notes**, then **Review now** to start a session on it.

### 5. Practice

Open **Practice**, then **2024 Midterm**.

- Question 7 shows the worked solution. The original exam had no answer key, so Cue wrote it from Lecture 8 and says so.
- Click **Ask why** for a follow-up.
- Click **Write questions**, choose 5. New questions stream in. A second Nemotron call checks every option, and drops any question with two right answers.
- Back on Practice, upload `sample-quiz.pdf`. Super VL reads both pages, keeps the code block and the tree diagram, and takes the answers from the key. Cue solves question 4, which the key skipped.

### 6. Study guide

Open **Study guides**. The ECO101 section on price elasticity has a formula, two demand curves, a "Common mistake · will be on the midterm" box and footnotes back to the lecture and textbook.

- Click **Quiz me on this section**. A practice set opens with questions written from this section.
- Switch the course to CSC148 and click **Write this guide**. Nemotron writes each section from the course's own material, with the Tree code from the slides.
- On ECO101, click **Add material**, upload `eco101-lecture8-slides.pdf`. The section offers to rewrite itself with the new slides.

## A three-minute cut

1. Today and the calendar, 30 seconds.
2. The study session with one Deep answer and its citations, 45 seconds.
3. Recording a lecture with a flagged hint, 30 seconds.
4. Uploading `sample-quiz.pdf` and opening a solved question, 30 seconds.
5. The ECO101 guide, then Quiz me, 30 seconds.
6. End on Today.
