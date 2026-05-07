# Speaker Script — First PFE Review (20 minutes, English)

> **How to use this script:**
> - Read aloud at a comfortable pace (~140 words/min). Total ≈ 19 minutes.
> - Each slide has a target time. Don't go faster — silence between slides is fine.
> - The lines in *italics* are stage cues, not spoken aloud.
> - Look at the audience, not the screen. Glance at your slide only when transitioning.
> - Memorize the **opening sentence** of each slide — that's the hardest moment. The rest will flow.

---

## Slide 1 — Title slide
**Time: 30 seconds**

*(Stand confidently, smile, make eye contact with all three people before starting.)*

> Good morning everyone. Thank you for taking the time to attend this first project review. My name is Firas Mahjoubi, and today I'd like to walk you through the project I've been building during my final-year internship at INSOMEA — an end-to-end MLOps platform on Kubernetes. I'll aim for about 20 minutes, and then I'll open the floor for your questions and feedback.

*(Click to next slide.)*

---

## Slide 2 — Table of Contents
**Time: 30 seconds**

> Here's the path I'll take. I'll start with a quick word about INSOMEA — where this project lives. Then I'll explain the problem we're solving, the objectives I set, and walk you through how the platform actually works for an end user. After that, we'll look at the technologies behind it, where the project stands today, and what remains before the final defense.

*(Click to next slide.)*

---

## Slide 3 — Company Introduction (INSOMEA)
**Time: 1.5 minutes**

> My internship is hosted at INSOMEA — a Microsoft Cloud Gold Partner, and recently part of the Beyon Solutions group. INSOMEA helps enterprises across the Middle East and Africa region adopt Microsoft 365, Azure, and cybersecurity solutions.                  
>
> A few key numbers: more than 50 employees, over 500 customers, 6 offices across Tunisia, Bahrain, France, Algeria, Morocco, and Ivory Coast. The company has been operating for more than 8 years, and it has been recognized 5 times as Microsoft Partner of the Year.
>
> What's important for this project is INSOMEA's deep specialization in the Microsoft cloud — particularly Azure. So an MLOps platform that's designed to deploy on Microsoft Azure is a natural fit. It extends INSOMEA's existing expertise into the AI and machine learning space, which is a direction the company is actively investing in.

*(Click to next slide.)*

---

## Slide 4 — The Problem
**Time: 3 minutes — this is the hook, slow down here**

> Now, the problem the platform is solving. Let me start with a concrete scenario.
>
> Imagine a data scientist. She trains a great model on her laptop — let's say it hits 95% accuracy on her test set. She's happy with it. Now she needs that model in production, serving real predictions to real users.
>
> Six weeks later, the model is still not deployed. *(Pause briefly.)* And this is not an edge case — it's the norm.
>
> Why does this happen? There are four blockers, and I've seen all of them in real teams.
>
> **First — environment mismatch.** The model worked on her laptop, but in production the library versions are different, the operating system is different, the compute is different. The model breaks. Or worse, it gives subtly wrong predictions that nobody notices.
>
> **Second — no experiment tracking.** She tried twenty different models last month. Which one was the best? Which hyperparameters did it use? Which version of the dataset? It's all in scattered notebooks. Reproducing her best result is impossible.
>
> **Third — the DevOps barrier.** To deploy her Python file, she's expected to learn Docker, Kubernetes, CI/CD, YAML, Helm — an entire stack of tools that has nothing to do with machine learning. Most data scientists simply don't have the time.
>
> **Fourth — no monitoring.** Once the model is somehow live, nobody can tell if it's still working. Models silently degrade. Inputs drift. Predictions become unreliable. And nobody notices until a customer complains.
>
> *(Point at the bottom of the slide — the Gartner number.)*
>
> The result, according to Gartner, is that 70% of machine learning models never reach production. That's a massive waste of effort — and it's a real business problem.
>
> What I built is a platform that solves all four of these problems automatically. The data scientist uploads her code, and the platform handles the rest — environment, tracking, deployment, and monitoring. That's the core idea, and the rest of the presentation walks you through how it works.

*(Click to next slide.)*

---

## Slide 5 — Project Objectives
**Time: 2 minutes**

> So to address those four problems, I set five concrete objectives — five promises the platform makes to its user.
>
> **First — upload and deploy.** The user uploads a Python script. They get a live REST API in minutes. No Docker, no YAML, no DevOps knowledge required. That's the headline promise.
>
> **Second — automatic experiment tracking.** Every time the user trains a model, the platform captures the metrics, the parameters, the model artifacts — without asking. Everything is reproducible by default.
>
> **Third — a versioned model registry.** Once trained, the model gets a version number. The user can promote it, archive it, or roll back to a previous version with one click. Like git, but for models.
>
> **Fourth — live monitoring built in.** The moment the model goes live, the user can see CPU, memory, and traffic in real time, in the same UI. No external dashboard, no separate tool.
>
> **Fifth — runs anywhere.** The same platform on a laptop, in a private datacenter, or on Microsoft Azure. The architecture is cloud-portable by design.
>
> *(Briefly point to the slide title.)*
>
> The overall philosophy is captured in the title — make machine learning operations as simple as modern web development. A web developer doesn't worry about how their code runs in production — the platform handles it. The same should be true for machine learning.

*(Click to next slide.)*

---

## Slide 6 — How It Works (the workflow)
**Time: 4 minutes — the most important slide, take your time**

> This is probably the most important slide of the presentation. Let me walk you through exactly what a user does on the platform, end to end. Seven simple steps.
>
> **Step one — create a project.** The user logs in, gives the project a name and a description, and uploads their training code as a .zip file. That's it. The .zip can contain any Python code, in any structure — the platform auto-detects the entry-point script.
>
> **Step two — trigger training.** One click. The platform packages the code, sends it to the Kubernetes cluster, and starts a training job automatically. The user doesn't write any YAML and doesn't touch any infrastructure.
>
> **Step three — watch live logs.** There's a built-in terminal in the UI that streams the training logs in real time. You can filter, search, copy, and download. So if something goes wrong, the user can debug right there in the same window.
>
> **Step four — see the experiments.** Every run that completes is automatically registered with its full set of metrics — accuracy, F1, ROC-AUC, anything the script logged. The user can compare runs side by side and pick the best one.
>
> **Step five — promote the best model.** Once the user identifies the winning model, they click "Promote to Production." That moves the model to the production stage in the registry — conceptually like merging a pull request.
>
> **Step six — deploy as a REST API.** One more click. The platform creates a KServe inference service on Kubernetes, exposes a public endpoint, and returns the URL — usually within 30 seconds.
>
> **Step seven — test the prediction live.** There's a built-in tester in the UI. The user pastes some input data, clicks "Predict," and sees the model's response immediately. No need to leave the platform, no need to write a curl command.
>
> *(Pause, point to the green strip at the bottom.)*
>
> That's the entire workflow. From a Python file to a production API in six clicks. Zero infrastructure code from the user.
>
> And what I want to emphasize is — this is not a mockup. Every step you just heard works today. I'd be happy to demo it live after the presentation, if you'd like.

*(Click to next slide.)*

---

## Slide 7 — Technologies
**Time: 2 minutes**

> Now let me briefly cover the technologies. The architecture is organized in three layers.
>
> *(Point to the top of the diagram.)*
>
> **The interface layer** — what users see and click on. It's a modern web application built with Angular 19 and Tailwind CSS. Standard frontend stack, nothing exotic.
>
> *(Point to the middle.)*
>
> **The brain layer** — the backend that orchestrates everything. It's built with FastAPI in Python. This is the only layer that talks to the rest — to the database, to MLflow, to the Kubernetes cluster. The frontend never touches infrastructure directly. That's an important design choice — it keeps the security model simple and gives us one single integration point.
>
> *(Point to the bottom.)*
>
> **The factory layer** — where the actual machine learning happens. Four open-source tools, all industry standards: Kubernetes for compute, Kubeflow for training pipelines, MLflow for experiment tracking and the model registry, and KServe for serving the models as REST APIs.
>
> One key design decision: everything is 100% open-source. No vendor lock-in. The same architecture runs on a laptop today, on a private Kubernetes cluster, and on Microsoft Azure tomorrow. That portability is intentional — it gives INSOMEA the flexibility to run this for different clients, in different environments, without changing the codebase.

*(Click to next slide.)*

---

## Slide 8 — Project Progress
**Time: 2.5 minutes**

> Now let me show you where the project actually stands today. The current phase is development and testing.
>
> *(Point to the left column.)*
>
> On the left — what's **fully working**. Authentication, projects, and code upload. Training pipelines for both prebuilt examples and custom user code. Automatic experiment tracking via MLflow. The model registry with promote, archive, and delete. One-click KServe deployment with automatic recovery when the webhook fails. Real-time inference testing from the UI. The live dashboard showing cluster CPU, memory, and active runs. And the professional log terminal with filter, search, copy, and download.
>
> That's the full happy path. A user can today go from uploading code to getting a live prediction endpoint — without me intervening.
>
> *(Point to the right column.)*
>
> On the right — what's **in active testing** right now. End-to-end flows on a fresh Kubernetes cluster — making sure everything works from a clean install. Edge cases in custom user code — what if the user uploads a script with unusual imports, or training that takes hours, or training that fails halfway? And failure recovery scenarios — KServe's admission webhook can occasionally crash, and I'm hardening the platform to handle that gracefully.
>
> *(Point to the bottom-right.)*
>
> Below that — what's **starting next**. Microsoft Azure deployment work. Up to now, everything has run locally — Docker Compose for development, a small kind cluster for end-to-end tests. The next phase is to lift it onto Azure. And that's specifically where I'd like your input today.

*(Click to next slide.)*

---

## Slide 9 — Remaining Tasks
**Time: 2 minutes**

> Looking ahead — four workstreams remain between today and the final defense.
>
> *(Point to each card as you describe it.)*
>
> **Cloud** — migrating the platform to Microsoft Azure. The specific Azure services to use — for the cluster, the container registry, storage, identity — those are decisions I'd like to confirm with you today, given INSOMEA's deep Microsoft expertise.
>
> **Monitoring** — production-grade metrics. Today I have CPU and memory at the pod level. I want to add request rate, latency percentiles, and basic drift alerts on input distributions.
>
> **Polish** — UI improvements. There are a few screens that still need restyling — the model comparison view, the signup page — and an accessibility pass to make sure the platform is usable for everyone.
>
> **Documentation** — the user guide, the installation guide as a Helm chart, the final PFE report, and the defense rehearsal.
>
> *(Pause briefly, then deliver this part with extra confidence.)*
>
> What I'm asking from this meeting is straightforward.
>
> First — validate that the architecture and the scope make sense.
>
> Second — agree on the Azure migration approach: which services, what timeline.
>
> Third — help me prioritize. Among these four workstreams, which two or three should I focus on first?
>
> And fourth — set the date for our next checkpoint.

*(Click to next slide.)*

---

## Slide 10 — Thank You
**Time: 1 minute**

*(Slow down. Make eye contact with all three people. Smile.)*

> Thank you for your attention.
>
> To summarize the project in one sentence: it takes a data scientist from a Python file to a live REST API in five clicks. That's the value proposition, and I believe it's something INSOMEA's data and ML practice could realistically use with real clients.
>
> I'm now happy to take your questions, your feedback, and especially your suggestions on what to prioritize next.
>
> Thank you.

*(Stay standing, hands relaxed, ready for questions. Don't fidget. Don't sit down.)*

---

## Quick rehearsal tips

- **Practice the first 30 seconds three times.** First impressions are 80% of the meeting. If you start strong, the rest comes naturally.
- **Time yourself once.** Read the whole script aloud with a stopwatch. If you're under 17 min, slow down. If over 22 min, trim slide 4 (the problem story) — that's the easiest to compress.
- **Anticipate three likely questions:**
  1. *"Why Kubeflow Pipelines and not just GitLab CI / Azure DevOps?"* → Answer: ML pipelines need typed artifacts and lineage that CI/CD doesn't provide. CI/CD is on the roadmap for *shipping the platform itself*, not for user training jobs.
  2. *"How does multi-tenancy work — can two customers share the cluster safely?"* → Answer: today, row-level isolation in Postgres. For the cloud version, namespace-per-tenant with RBAC.
  3. *"What's the cost story on Azure?"* → Answer: KServe scales to zero on Knative, so idle deployments cost nothing. Cluster autoscaler off-hours. I'll prepare a detailed estimate before the next checkpoint.
- **Don't apologize.** If you forget a word, just continue. They won't notice.
- **End on time.** Stopping at 20 minutes is more impressive than running over with extra detail.
