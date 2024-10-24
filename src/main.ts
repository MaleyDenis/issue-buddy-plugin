import {Plugin, TFile} from "obsidian";

import * as stream from 'stream';
import * as readline from 'readline';
import {IssueRecord} from "./issue-record";

export default class IssuesBuddyPlugin extends Plugin {

  readonly ISSUES_FILE_NAME = "Open Issues.md";
  readonly ISSUE_FILE_MARK = "#q-";
  readonly UNSORTED_ISSUES_FILE_NAME = "Unsorted.md";

  async onload() {
    this.addCommand({
      id: "create-issues-document",
      name: "create issues table",
      callback: () => {
        this.createIssueDocument(this.ISSUES_FILE_NAME);
      }
    });
  }

  async createIssueDocument(fileName: string) {
    const file = this.app.vault.getAbstractFileByPath(fileName) as TFile;

    //Clear the file before appending.
    //Each time the command is run, the table will be cleared and re-generated
    await this.app.vault.modify(file, "");

    const issueRecords = await this.findAllIssues();
    await this.appendTableToFile(file, issueRecords);
  }

  async findAllIssues(): Promise<IssueRecord[]> {
  // Retrieve all Markdown files except the issues file
  const filteredFiles = this.app.vault.getMarkdownFiles()
    .filter(file => file.name !== this.ISSUES_FILE_NAME);

  const allIssues: IssueRecord[] = [];

  // Iterate over each filtered file to extract issues
  for (const file of filteredFiles) {
    try {
      // Extract issues from each file and await the result
      const fileIssues = await this.extractIssuesFromFile(file);
      // Append extracted issues to the result array
      allIssues.push(...fileIssues);
    } catch (error) {
      // Handle errors gracefully (optional: log or throw further)
      console.error(`Error processing file ${file.name}: ${error.message}`);
      // Continue processing other files even if one fails
    }
  }

  // Return all extracted issues
  return allIssues;
}

  async extractIssuesFromFile(file: TFile) {
    const content = await this.app.vault.read(file);
    const contentStream = new stream.Readable({
      read() {
        this.push(content);
        this.push(null); // Indicates end of the stream
      }
    });

    const lineReader = readline.createInterface({
      input: contentStream,
      crlfDelay: Infinity
    });

    const issueRecords: IssueRecord[] = [];
    await new Promise<void>((resolve, reject) => {
      lineReader.on('line', (line) => {
        if (line.includes(this.ISSUE_FILE_MARK)) {
          const tableEntry = this.processLine(line, file);
          issueRecords.push(tableEntry);
        }
      });

      lineReader.on('close', () => {
        resolve();
      });
    })

    return issueRecords;
  }

  private processLine(line: string, file: TFile) {
    const path = file.path.split(' ').join('%20');
    const subject = file.name !== this.UNSORTED_ISSUES_FILE_NAME ?
      file.basename : file.path.split('/').slice(-2, -1)[0];
    const [unprocessedIssue, unprocessedTagLabel] = line.split("#");
    const issue = unprocessedIssue.replace(/\|/g, '');
    const tagLabel = unprocessedTagLabel.replace(/\|/g, '').trim();
    const difficulty = parseInt(unprocessedTagLabel.charAt(tagLabel.length - 1));

    const tableEntry: IssueRecord = {
      path: path,
      subject: subject,
      issue: issue,
      tag: '#' + tagLabel,
      difficulty: difficulty
    };
    return tableEntry;
  }

  async appendTableToFile(file: TFile, tables: IssueRecord[]) {
    if (file) {
      let content = await this.app.vault.read(file);
      const tableMarkdown = this.generateMarkdownTable(tables);
      content += '\n' + tableMarkdown;

      await this.app.vault.modify(file, content); // Write the modified content back to the file
    }
  }

  generateMarkdownTable(issueRecords: IssueRecord[]): string {
    issueRecords.sort((a, b) => a.difficulty - b.difficulty);

    let markdown = `| Subject | Issue | Difficulty | Tag |\n`;
    markdown += `|------|-------|------------|-----|\n`;

    issueRecords.forEach(issue => {
      const badge = this.createBadge(issue.difficulty);
      markdown += `| [${issue.subject}](${issue.path}) | ${issue.issue} | ${badge} | ${issue.tag} |\n`;
    });

    return markdown;
  }

  createBadge(difficulty: number): string {
    switch (difficulty) {
      case 1:
        return "<span style=\"color: rgb(204, 204, 0)\">Easy Peasy</span>";
      case 2:
        return "<span style=\"color: rgb(230, 138, 0)\">Conceptual</span>";
      case 3:
        return "<span style=\"color: rgb(0, 153, 51)\">Intermediate</span>";
      case 4:
        return "<span style=\"color: rgb(230, 138, 0)\">Deep Dive</span>";
      case 5:
        return "<span style=\"color: rgb(204, 41, 0)\">The Wizard Level</span>";
      default:
        return "`U N K N O W N`";
    }
  }
}
