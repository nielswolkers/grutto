import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listSubjects from "./tools/list-subjects";
import listStudySets from "./tools/list-study-sets";
import getStudySet from "./tools/get-study-set";
import createStudySet from "./tools/create-study-set";
import addStudyCards from "./tools/add-study-cards";
import listTasks from "./tools/list-tasks";
import createTask from "./tools/create-task";
import completeTask from "./tools/complete-task";
import listCalendarEvents from "./tools/list-calendar-events";
import createCalendarEvent from "./tools/create-calendar-event";
import listNotes from "./tools/list-notes";
import createNote from "./tools/create-note";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "grutto",
  title: "Grutto",
  version: "0.1.0",
  instructions:
    "Tools for Grutto, a Dutch study platform. Read and write the signed-in student's subjects (vakken), study sets with flashcards (studiesets), tasks (taken), agenda events and notes (notities). Use list_subjects first when a subject id is needed. Study sets can be opened in the app at /studieset/<id>.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listSubjects,
    listStudySets,
    getStudySet,
    createStudySet,
    addStudyCards,
    listTasks,
    createTask,
    completeTask,
    listCalendarEvents,
    createCalendarEvent,
    listNotes,
    createNote,
  ],
});
