import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * List upcoming calendar events
 * @param {Object} options
 * @param {number} options.hours - Look ahead window in hours (default: 24)
 * @returns {Promise<Array>} List of events
 */
export async function listUpcoming({ hours = 24 } = {}) {
  try {
    // Try using gog CLI first
    const result = execSync(
      `gog cal list --hours ${hours} --json`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    return JSON.parse(result);
  } catch (err) {
    // Fallback: return empty if gog not available
    console.warn('gog CLI not available, returning empty events');
    return [];
  }
}

/**
 * Search memory for relevant context
 * @param {string} query - Search query (event title, participants, etc.)
 * @returns {Promise<string>} Relevant context snippets
 */
async function searchMemory(query) {
  const memoryPath = '/root/openclaw/MEMORY.md';
  const dailyPath = `/root/openclaw/memory/${new Date().toISOString().split('T')[0]}.md`;
  
  let context = '';
  
  // Search MEMORY.md
  if (existsSync(memoryPath)) {
    const memory = readFileSync(memoryPath, 'utf-8');
    const lines = memory.split('\n');
    const relevant = lines.filter(line => 
      line.toLowerCase().includes(query.toLowerCase())
    );
    if (relevant.length > 0) {
      context += '## From MEMORY.md\n' + relevant.slice(0, 5).join('\n') + '\n\n';
    }
  }
  
  // Search today's daily note
  if (existsSync(dailyPath)) {
    const daily = readFileSync(dailyPath, 'utf-8');
    const lines = daily.split('\n');
    const relevant = lines.filter(line => 
      line.toLowerCase().includes(query.toLowerCase())
    );
    if (relevant.length > 0) {
      context += '## From Today\n' + relevant.slice(0, 5).join('\n') + '\n\n';
    }
  }
  
  return context;
}

/**
 * Prepare meeting brief for a specific event
 * @param {Object} event - Event object from calendar
 * @returns {Promise<string>} Meeting brief
 */
export async function prepareMeeting(event) {
  const { summary, start, end, attendees = [], description = '' } = event;
  
  // Search for relevant context
  const queries = [
    summary,
    ...attendees.map(a => a.email?.split('@')[0] || a.displayName).filter(Boolean)
  ];
  
  let context = '';
  for (const query of queries.slice(0, 3)) { // Limit searches
    context += await searchMemory(query);
  }
  
  // Generate brief
  let brief = `# Meeting Brief: ${summary}\n\n`;
  brief += `**Time:** ${start} - ${end}\n`;
  
  if (attendees.length > 0) {
    brief += `**Participants:** ${attendees.map(a => a.displayName || a.email).join(', ')}\n`;
  }
  
  if (description) {
    brief += `\n**Agenda:**\n${description}\n`;
  }
  
  if (context) {
    brief += `\n**Relevant Context:**\n${context}`;
  } else {
    brief += `\n*No relevant context found in memory.*\n`;
  }
  
  return brief;
}

/**
 * Generate morning briefing with all upcoming meetings
 * @param {number} hours - Look ahead window
 * @returns {Promise<string>} Full briefing
 */
export async function morningBriefing(hours = 24) {
  const events = await listUpcoming({ hours });
  
  if (events.length === 0) {
    return 'No meetings scheduled in the next 24 hours.';
  }
  
  let briefing = `# Upcoming Meetings (Next ${hours}h)\n\n`;
  
  for (const event of events) {
    briefing += await prepareMeeting(event);
    briefing += '\n---\n\n';
  }
  
  return briefing;
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] || 'list';
  
  if (command === 'list') {
    const hours = parseInt(process.argv[3] || '24');
    listUpcoming({ hours }).then(events => {
      console.log(JSON.stringify(events, null, 2));
    });
  } else if (command === 'brief') {
    const hours = parseInt(process.argv[3] || '24');
    morningBriefing(hours).then(brief => {
      console.log(brief);
    });
  }
}
