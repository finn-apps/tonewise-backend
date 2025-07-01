const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize Claude API
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // limit each IP to 50 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.'
    }
});
app.use('/api/', limiter);

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Single message analysis endpoint
app.post('/api/analyze', async (req, res) => {
    try {
        const { message, context, type } = req.body;

        // Validation
        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                error: 'Message is required and must be a string'
            });
        }

        if (message.length > 5000) {
            return res.status(400).json({
                error: 'Message is too long (max 5000 characters)'
            });
        }

        // Create the prompt for single message analysis
        const prompt = createSingleAnalysisPrompt(message, context || '');

        // Call Claude API
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        const analysis = response.content[0].text;
        const confidenceLevel = extractConfidenceLevel(analysis);

        res.json({
            analysis,
            confidenceLevel,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({
            error: 'Failed to analyze message. Please try again.'
        });
    }
});

// Message comparison endpoint
app.post('/api/compare', async (req, res) => {
    try {
        const { messages, context, type } = req.body;

        // Validation
        if (!Array.isArray(messages) || messages.length < 2) {
            return res.status(400).json({
                error: 'At least 2 messages are required for comparison'
            });
        }

        if (messages.length > 10) {
            return res.status(400).json({
                error: 'Too many messages (max 10 for comparison)'
            });
        }

        // Validate each message
        for (const msg of messages) {
            if (!msg || typeof msg !== 'string') {
                return res.status(400).json({
                    error: 'All messages must be non-empty strings'
                });
            }
            if (msg.length > 2000) {
                return res.status(400).json({
                    error: 'Each message must be under 2000 characters'
                });
            }
        }

        // Create the prompt for comparison analysis
        const prompt = createComparisonPrompt(messages, context || '');

        // Call Claude API
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1200,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        const analysis = response.content[0].text;
        const confidenceLevel = extractConfidenceLevel(analysis);

        res.json({
            analysis,
            confidenceLevel,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Comparison error:', error);
        res.status(500).json({
            error: 'Failed to compare messages. Please try again.'
        });
    }
});

// Helper function to create single analysis prompt
function createSingleAnalysisPrompt(message, context) {
    return `Please analyze this social interaction for tone, intent, and potential subtext. 
This analysis is to help someone understand social communication better.

Context: ${context || 'No additional context provided'}

Message/Interaction: "${message}"

Please provide a clear, helpful analysis that includes:

**Overall Tone**: Describe the general emotional tone (supportive, neutral, concerned, etc.)

**Likely Intent**: What the person probably meant to communicate

**Potential Concerns**: Any aspects that might be interpreted differently, if any

**Confidence Level**: How confident you are in this interpretation (High/Medium/Low)

**Red Flags**: Any concerning language or potential negative implications, if any

**Positive Indicators**: Signs of genuine care, support, or positive intent

**Bottom Line**: A clear, direct summary of what this message likely means

Be honest, clear, and helpful. Focus on practical insights that help someone understand the communication better.`;
}

// Helper function to create comparison prompt
function createComparisonPrompt(messages, context) {
    const messagesText = messages.map((msg, i) => `Message ${i + 1}: "${msg}"`).join('\n\n');
    
    return `Please analyze this sequence of interactions to identify patterns in tone and relationship dynamics.

Context: ${context || 'No additional context provided'}

Messages:
${messagesText}

Please provide a comprehensive analysis that includes:

**Pattern Analysis**: How does the tone evolve across these messages?

**Relationship Dynamic**: What does this suggest about the relationship between the people involved?

**Consistency Check**: Are the messages consistent in tone and intent?

**Overall Assessment**: Is this a positive, neutral, or concerning interaction pattern?

**Key Insights**: What are the most important takeaways from this sequence?

**Bottom Line**: A clear summary of what this pattern of communication suggests

Focus on helping understand the social dynamics and communication patterns at play.`;
}

// Helper function to extract confidence level from analysis
function extractConfidenceLevel(analysis) {
    const confidenceMatch = analysis.match(/Confidence Level.*?:(.*?)(?:\n|\*\*|$)/i);
    if (confidenceMatch) {
        const level = confidenceMatch[1].trim();
        if (level.toLowerCase().includes('high')) return 'High';
        if (level.toLowerCase().includes('medium')) return 'Medium';
        if (level.toLowerCase().includes('low')) return 'Low';
    }
    return null;
}

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found'
    });
});

// Start server
app.listen(port, () => {
    console.log(`ToneWise backend running on port ${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
});

module.exports = app;
