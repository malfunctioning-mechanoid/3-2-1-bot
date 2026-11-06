// --- 1. Placeholder: Fetch the Custom URL ---
async function fetchNewsletterUrl() {
    // TODO: Implement your logic to get this week's URL
    // For now, returning a static example URL
    return 'https://jamesclear.com/3-2-1/november-5-2026';
}

async function fetchHtml(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.text();
}

// --- 2. Parser Logic ---
function parseNewsletter(html) {
    const results = [];

    const ideasMatch = html.match(/<h2[^>]*>[^<]*3 IDEAS[^<]*<\/h2>(.*?)<h2/is);
    const quotesMatch = html.match(/<h2[^>]*>[^<]*2 QUOTES[^<]*<\/h2>(.*?)<h2/is);
    const questionsMatch = html.match(/<h2[^>]*>[^<]*1 QUESTION[^<]*<\/h2>(.*?)(?:<div[^>]*spacer|<p>Until next week|<hr)/is);

    function extractItems(sectionHtml, type) {
        if (!sectionHtml) return;
        
        let chunks = sectionHtml.split(/(?:<hr[^>]*>\s*)?<p>[^a-zA-Z0-9]*(?:I{1,3}|IV|V)\.<\/p>/ig);
        if (chunks.length <= 1) chunks = sectionHtml.split(/<hr[^>]*>/i);

        chunks.forEach(chunk => {
            let text = chunk.replace(/<\/?p[^>]*>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
            text = text.replace(/\n\s*Source:.*$/gmi, '');
            text = text.replace(/<[^>]+>/g, '');
            text = text.replace(/&#8220;|&ldquo;|“/g, '"')
                       .replace(/&#8221;|&rdquo;|”/g, '"')
                       .replace(/&#8216;|&lsquo;|‘/g, "'")
                       .replace(/&#8217;|&rsquo;|’/g, "'")
                       .replace(/&#8212;|&mdash;/g, "—")
                       .replace(/&amp;/g, '&')
                       .replace(/&nbsp;/g, ' ')
                       .replace(/[\u200B-\u200D\uFEFF]/g, '');

            let lines = text.split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0)
                .filter(l => !/^(?:I{1,3}|IV|V)\.$/.test(l));
                
            let finalStr = lines.join('\n\n');
            
            if (finalStr) {
                if (!finalStr.startsWith('"')) finalStr = '"' + finalStr;
                if (!finalStr.endsWith('"')) finalStr = finalStr + '"';
                
                // Truncate to 2000 chars (Notion's Title property limit)
                if (finalStr.length > 2000) finalStr = finalStr.substring(0, 1997) + "...";
                
                results.push({ Type: type, Content: finalStr });
            }
        });
    }

    extractItems(ideasMatch ? ideasMatch[1] : '', 'Idea');
    extractItems(quotesMatch ? quotesMatch[1] : '', 'Quote');
    extractItems(questionsMatch ? questionsMatch[1] : '', 'Question');

    return results;
}

// --- 3. Notion Integration ---
async function pushToNotion(item) {
    const NOTION_API_KEY = process.env.NOTION_API_KEY;
    const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

    const payload = {
        parent: { database_id: NOTION_DATABASE_ID },
        properties: {
            "Content": {
                title: [{ text: { content: item.Content } }]
            },
            "Type": {
                select: { name: item.Type }
            }
        }
    };

    const response = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${NOTION_API_KEY}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to push to Notion: ${errorText}`);
    } else {
        console.log(`Successfully added: ${item.Type}`);
    }
}

// --- 4. Main Execution ---
async function run() {
    try {
        console.log("Fetching newsletter URL...");
        const url = await fetchNewsletterUrl();
        
        console.log(`Fetching HTML from ${url}...`);
        const html = await fetchHtml(url);
        
        console.log("Parsing items...");
        const items = parseNewsletter(html);
        
        console.log(`Found ${items.length} items. Pushing to Notion...`);
        for (const item of items) {
            await pushToNotion(item);
        }
        
        console.log("Process complete.");
    } catch (error) {
        console.error("Error executing script:", error);
        process.exit(1);
    }
}

run();
