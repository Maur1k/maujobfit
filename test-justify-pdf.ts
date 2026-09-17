import { buildProfessionalResumePdf } from "@/lib/resume-pdf-professional.ts";
import { writeFile } from "fs/promises";

const input = {
  profile: {
    full_name: "Maurik Angelo Fernandez",
    headline: "Junior Software Engineer",
    email: "maurikfernandez123@gmail.com",
    phone: "+639277975100",
    location: "Urdaneta City, Pangasinan",
    portfolio_url: "https://maurikfernandez-portfolio.vercel.app",
    github_url: "https://github.com/Maur1k",
    linkedin_url: "https://linkedin.com/in/maurik-angelo-fernandez-aab35716a",
  },
  jobTitle: "Web Developer",
  version: 1,
  onePage: true,
  items: [
    {
      id: "s1",
      section: "summary",
      heading: null,
      statement:
        "Software Developer and BS Information Technology graduate with hands-on experience building, maintaining, and deploying production web, backend, and mobile applications. Experienced with Node.js, Express, React, Laravel, PHP, Flutter, MySQL, Firebase, and REST APIs.",
      evidenceIds: [],
    },
    {
      id: "e1",
      section: "experience",
      heading: "When in Baguio, Inc.",
      statement:
        "Maintained and enhanced the production WIB V2 operations platform by implementing features, troubleshooting issues, and resolving bugs to keep operational workflows reliable across the team.",
      evidenceIds: ["ev1"],
    },
    {
      id: "p1",
      section: "project",
      heading: "WIB V2 — Operations & Dispatch Platform",
      statement:
        "Rebuilt the operations and dispatch platform by migrating the legacy Yii/PHP system to Node.js, React, MySQL, Firebase, and cPanel, establishing the foundation for the company's modern operational platform.",
      evidenceIds: ["ev2"],
    },
    {
      id: "sk1",
      section: "skill",
      heading: null,
      statement: "JavaScript",
      evidenceIds: [],
    },
    {
      id: "sk2",
      section: "skill",
      heading: null,
      statement: "React",
      evidenceIds: [],
    },
    {
      id: "sk3",
      section: "skill",
      heading: null,
      statement: "Tailwind CSS",
      evidenceIds: [],
    },
    {
      id: "ed1",
      section: "education",
      heading: "Bachelor of Science in Information Technology | Pangasinan State University – Urdaneta Campus",
      statement: "Major in Web and Mobile Technologies — Batch 2026",
      evidenceIds: ["ev3"],
    },
  ],
  evidence: new Map([
    [
      "ev1",
      {
        id: "ev1",
        category: "experience",
        title: "Software Developer",
        organization: "When in Baguio, Inc.",
        role: "Software Developer",
        start_date: "2026-05-01",
        end_date: "2026-08-01",
        skills: ["Node.js", "React"],
      },
    ],
    [
      "ev2",
      {
        id: "ev2",
        category: "project",
        title: "WIB V2 — Operations & Dispatch Platform",
        organization: "When in Baguio, Inc.",
        role: "Full-Stack Developer",
        start_date: "2025-01-01",
        end_date: "2025-12-01",
        skills: ["Node.js", "React", "MySQL", "Firebase"],
      },
    ],
    [
      "ev3",
      {
        id: "ev3",
        category: "education",
        title: "Bachelor of Science in Information Technology",
        organization: "Pangasinan State University – Urdaneta Campus",
        role: "Student",
        start_date: "2022-08-01",
        end_date: "2026-05-01",
      },
    ],
  ]),
};

const { blob, fileName } = buildProfessionalResumePdf(input as any);
const b = await (blob as any)();
const arrayBuffer = await b.arrayBuffer();
const buffer = Buffer.from(arrayBuffer);
const path = "/tmp/test-justify-resume.pdf";
await writeFile(path, buffer);
console.log("wrote", fileName, "to", path);
