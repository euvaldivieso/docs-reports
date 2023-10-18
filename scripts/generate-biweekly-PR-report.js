const axios = require('axios');
const fs = require('fs');
const yargs = require('yargs');
const { Parser } = require('json2csv');
const { subWeeks, startOfDay, format } = require('date-fns');

require('dotenv').config();

const args = yargs.options({
  'github-username': { type: 'string', demandOption: true, alias: 'u' },
  'github-repo': { type: 'string', demandOption: true, alias: 'r' },
}).argv;

const githubUsername = args['github-username'];
const githubRepo = args['github-repo'];
const authToken = process.env.GITHUB_AUTH_TOKEN;

// Define the headers for the CSV file
const fields = [
  'PR #',
  'Status',
  'Title',
  'Link',
  'Labels',
  'Description',
  'Date Merged',
];

// Fetch the merged PRs from the last two weeks
async function fetchMergedPRsForLastTwoWeeks() {
  try {
    // Calculate the date range for the last two weeks
    const now = new Date();
    const lastTwoWeeksStart = subWeeks(startOfDay(now), 2); // Start of the last two weeks
    const lastTwoWeeksEnd = now; // Current date

    const response = await axios.get(
      `https://api.github.com/repos/${githubUsername}/${githubRepo}/pulls?state=closed&sort=updated&direction=desc`,
      {
        headers: {
          Authorization: `token ${authToken}`,
        },
      }
    );

    const prs = response.data;
    const prData = [];

    for (const pr of prs) {
      const mergedDate = new Date(pr.merged_at);
      if (mergedDate >= lastTwoWeeksStart && mergedDate <= lastTwoWeeksEnd) {
        const labels = pr.labels.map((label) => label.name).join(', ');
        const description = extractDescription(pr.body);

        prData.push({
          'PR #': pr.number,
          Status: 'Merged', // Set merged PRs to "Merged" status
          Title: pr.title,
          Link: pr.html_url,
          Labels: labels,
          Description: description,
          'Date Merged': pr.merged_at,
        });
      }
    }

    // Sort the PRs by the 'Labels' column
    prData.sort((a, b) => (a.Labels < b.Labels ? -1 : 1));

    return prData;
  } catch (error) {
    console.error('Error fetching PRs:', error);
    return [];
  }
}

// Fetch all open PRs
async function fetchOpenPRs() {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${githubUsername}/${githubRepo}/pulls?state=open`,
      {
        headers: {
          Authorization: `token ${authToken}`,
        },
      }
    );

    const prs = response.data;
    const prData = [];

    for (const pr of prs) {
      const labels = pr.labels.map((label) => label.name).join(', ');
      const description = extractDescription(pr.body);

      prData.push({
        'PR #': pr.number,
        Status: 'Open', // Set open PRs to "Open" status
        Title: pr.title,
        Link: pr.html_url,
        Labels: labels,
        Description: description,
        'Date Merged': 'n/a', // Open PRs don't have a merge date
      });
    }

    // Sort the PRs by the 'Labels' column
    prData.sort((a, b) => (a.Labels < b.Labels ? -1 : 1));

    return prData;
  } catch (error) {
    console.error('Error fetching open PRs:', error);
    return [];
  }
}

// Extract the description under '### Detailed summary' header and stop at '>'
function extractDescription(body) {
  const regex = /### Detailed summary([\s\S]*?)(?=\s*>|$)/;
  const match = body.match(regex);

  if (match) {
    return match[1].trim();
  }

  return '';
}

// Main function to fetch data, sort, and create CSV
async function main() {
  const mergedPRs = await fetchMergedPRsForLastTwoWeeks();
  const openPRs = await fetchOpenPRs();

  const allPRs = [...mergedPRs, ...openPRs];

  if (allPRs.length > 0) {
    const parser = new Parser({ fields });
    const csv = parser.parse(allPRs);

    fs.writeFileSync('csv_output/biweekly_pr_report.csv', csv);
    console.log('CSV file created: biweekly_pr_report.csv');
  } else {
    console.log('No PRs found in the specified time range.');
  }
}

main();
