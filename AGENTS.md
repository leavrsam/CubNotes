<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:vercel-deployment-rules -->
# Vercel Deployment Workflow

This project is deployed on Vercel via GitHub integration. When making code changes that the user expects to see live, you MUST:
1. Commit your changes locally (`git add .` and `git commit`).
2. Push the changes to GitHub (`git push`).
This ensures Vercel automatically triggers a build and deploys the updates.
<!-- END:vercel-deployment-rules -->

<!-- BEGIN:terminal-commands-rule -->
# Terminal Commands for the User

When asking the user to manually run a command in their terminal, you MUST ALWAYS provide explicit instructions on how to navigate to the correct directory first. The user is not familiar with terminal navigation. 
Always include the `cd /path/to/project` command in your instructions immediately before the actual command they need to run.
<!-- END:terminal-commands-rule -->
