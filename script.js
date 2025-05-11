// Global variables
const GEMINI_API_KEY_FALLBACK = "SAMPPLE KEY"; // Renamed for clarity, acts as a fallback

let player; // YouTube player instance
let recipeData = {}; // To store the recipe steps and other data from LLM
let currentStepIndex = 0;
let timeUpdateInterval; // For auto-pausing video segments

// DOM Elements
const youtubeUrlInput = document.getElementById('youtubeUrl');
const processUrlBtn = document.getElementById('processUrlBtn');
const videoPlayerContainer = document.getElementById('videoPlayerContainer');
const stepInstructionDisplay = document.getElementById('stepInstruction');
const prevStepBtn = document.getElementById('prevStepBtn');
const nextStepBtn = document.getElementById('nextStepBtn');
const servingsInput = document.getElementById('servings');
const mainContent = document.querySelector('.main-content');
const header = document.querySelector('header');
const loadingMessageBelowButton = document.getElementById('loadingMessageBelowButton');
const stepProgressContainer = document.getElementById('stepProgressContainer');
const stepProgressText = document.getElementById('stepProgressText');
const stepProgressBarInner = document.getElementById('stepProgressBarInner');
const geminiApiKeyInput = document.getElementById('geminiApiKeyInput'); // Added

// Initially hide the main content and show the centered header
mainContent.classList.add('hidden');
header.classList.add('centered-header');

// Reset any potential display issues
if (header.classList.contains('centered-header')) {
    document.querySelector('.input-area').style.display = 'flex';
    document.querySelector('.input-area').style.alignItems = 'center';
}

// This function loads the YouTube IFrame Player API code asynchronously.
// It's called automatically by the YouTube API script included in index.html
function onYouTubeIframeAPIReady() {
    // We'll initialize the player when a video URL is processed
    console.log("YouTube API Ready");
}

// Function to extract video ID from YouTube URL
function getYouTubeVideoId(url) {
    let videoId = '';
    const urlObj = new URL(url);
    if (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') {
        videoId = urlObj.searchParams.get('v');
    } else if (urlObj.hostname === 'youtu.be') {
        videoId = urlObj.pathname.substring(1);
    }
    return videoId;
}

// Function to initialize or update the YouTube player
function setupPlayer(videoId) {
    if (player) {
        player.loadVideoById(videoId);
    } else {
        player = new YT.Player(videoPlayerContainer.id, {
            height: '100%', // Will be controlled by CSS aspect-ratio
            width: '100%',  // Will be controlled by CSS aspect-ratio
            videoId: videoId,
            playerVars: {
                'playsinline': 1,
                'controls': 1, // Show native YouTube controls
                'modestbranding': 1,
                'rel': 0
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange
            }
        });
    }
}

// The API will call this function when the video player is ready.
function onPlayerReady(event) {
    console.log("Player ready");
    // If we have recipe data already, we can load the first step
    if (recipeData.steps && recipeData.steps.length > 0) {
        loadStep(currentStepIndex);
    }
}

// The API calls this function when the player's state changes.
function onPlayerStateChange(event) {
    // console.log("Player state changed:", event.data);
    // If user manually pauses video, clear the auto-pause interval
    if (event.data === YT.PlayerState.PAUSED) {
        if (timeUpdateInterval) {
            // console.log("User paused, clearing auto-pause interval");
            clearInterval(timeUpdateInterval);
            timeUpdateInterval = null;
        }
    }
    // If user starts playing, and we had an auto-pause scheduled (e.g. they seeked away and played again)
    // we might need to re-enable it if they are still within the current step's time frame.
    // For simplicity now, we primarily rely on loadStep to set the interval.
}

// Function to convert HH:MM:SS or MM:SS or SS to seconds
function timeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = String(timeStr).split(':').map(Number);
    let seconds = 0;
    if (parts.length === 3) { // HH:MM:SS
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) { // MM:SS
        seconds = parts[0] * 60 + parts[1];
    } else if (parts.length === 1) { // SS
        seconds = parts[0];
    }
    return seconds;
}

// Function to load and display a specific recipe step
function loadStep(stepIndex) {
    if (!recipeData.steps || stepIndex < 0 || stepIndex >= recipeData.steps.length) {
        console.error("Invalid step index or no recipe data");
        return;
    }

    // Clear any existing time update interval from previous step
    if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
        timeUpdateInterval = null;
    }

    currentStepIndex = stepIndex;
    const step = recipeData.steps[stepIndex];

    stepInstructionDisplay.innerHTML = `<p>${step.instruction || "No instruction for this step."}</p>`;

    // Update Step Progress Bar
    if (recipeData.steps && recipeData.steps.length > 0 && stepProgressContainer && stepProgressText && stepProgressBarInner) {
        stepProgressText.textContent = `Step ${currentStepIndex + 1} of ${recipeData.steps.length}`;
        const progressPercent = ((currentStepIndex + 1) / recipeData.steps.length) * 100;
        stepProgressBarInner.style.width = `${progressPercent}%`;
        stepProgressContainer.style.display = 'block';
    } else if (stepProgressContainer) {
        stepProgressContainer.style.display = 'none';
    }

    if (player && typeof player.seekTo === 'function' && typeof player.playVideo === 'function') {
        const startTime = timeToSeconds(step.startTime);
        const endTime = timeToSeconds(step.endTime);
        player.seekTo(startTime, true);
        player.playVideo();
        if (endTime > startTime) {
            timeUpdateInterval = setInterval(() => {
                if (player && typeof player.getCurrentTime === 'function' && typeof player.pauseVideo === 'function') {
                    const currentTime = player.getCurrentTime();
                    if (currentTime >= endTime) {
                        player.pauseVideo();
                        if (timeUpdateInterval) {
                            clearInterval(timeUpdateInterval);
                            timeUpdateInterval = null;
                        }
                    }
                } else {
                    if (timeUpdateInterval) {
                        clearInterval(timeUpdateInterval);
                        timeUpdateInterval = null;
                    }
                }
            }, 250);
        }
    }

    updateNavigationButtons();

    // Render ingredients for the current step
    const ingredientsList = document.getElementById('ingredientsList');
    const ingredientsSection = document.getElementById('ingredientsSection');
    
    if (step.ingredients && Array.isArray(step.ingredients) && step.ingredients.length > 0 && ingredientsList) {
        ingredientsList.innerHTML = step.ingredients.map(ing => {
            let text = '';
            if (ing.quantity) text += `${ing.quantity} `;
            if (ing.unit) text += `${ing.unit} `;
            text += ing.name || '';
            return `<li>${text.replace(/\s+/g, ' ').trim()}</li>`;
        }).join('');
        ingredientsSection.style.display = 'block';
    } else if (ingredientsList) {
        ingredientsList.innerHTML = '<li>No specific ingredients listed for this step.</li>';
        // Optionally hide the section if no ingredients, or show the message above
        // ingredientsSection.style.display = 'none'; 
        ingredientsSection.style.display = 'block'; // Keep section visible to show the message
    } else {
        // Fallback if ingredientsList element doesn't exist for some reason
        if (ingredientsSection) ingredientsSection.style.display = 'none';
    }

    // Render servings note (remains global)
    const servingsNote = document.getElementById('servingsNote');
    if (recipeData.adjustedServings) {
        servingsNote.textContent = `This recipe is adjusted for ${recipeData.adjustedServings} servings.`;
    } else if (recipeData.originalServings) { // Show original if no adjustment
        servingsNote.textContent = `Original recipe serves: ${recipeData.originalServings}.`;
    } else {
        servingsNote.textContent = '';
    }
}

// Update the state of Previous/Next buttons
function updateNavigationButtons() {
    prevStepBtn.disabled = currentStepIndex === 0;
    nextStepBtn.disabled = !recipeData.steps || currentStepIndex === recipeData.steps.length - 1;
}

// --- Mock LLM Interaction ---
async function fetchRecipeFromLLM(youtubeUrl) {
    console.log("Fetching recipe for URL:", youtubeUrl);

    let userProvidedApiKey = geminiApiKeyInput.value.trim();
    let apiKeyToUse;
    let usingFallback = false;

    if (userProvidedApiKey) {
        apiKeyToUse = userProvidedApiKey;
    } else {
        apiKeyToUse = GEMINI_API_KEY_FALLBACK;
        usingFallback = true;
    }

    let showAlert = false;
    if (!apiKeyToUse) { 
        showAlert = true;
    } else if (apiKeyToUse === "YOUR_GEMINI_API_KEY") { 
        showAlert = true;
    } else if (usingFallback && apiKeyToUse === "AIzaSyCGTAmZdv-k9rVl68XYFgJps_xSfcLEmVg") { // Check the specific placeholder only if it's the active fallback
        showAlert = true;
    }

    if (showAlert) {
        alert("Please enter a valid Google API Key in the input field, or ensure the fallback key in script.js is valid and not a placeholder.");
        return null;
    }

    const videoId = getYouTubeVideoId(youtubeUrl);
    if (!videoId) {
        alert("Invalid YouTube URL. Could not extract video ID.");
        return null;
    }

    const userServings = servingsInput.value && Number(servingsInput.value) > 0 ? Number(servingsInput.value) : null;

    // Define the response schema for the LLM
    const recipeResponseSchema = {
        type: "OBJECT",
        properties: {
            recipeTitle: { type: "STRING" },
            videoId: { type: "STRING" },
            originalServings: { type: "STRING" },
            adjustedServings: { type: "STRING", nullable: true },
            steps: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        stepNumber: { type: "NUMBER" },
                        instruction: { type: "STRING" },
                        startTime: { type: "STRING" },
                        endTime: { type: "STRING" },
                        ingredients: {
                            type: "ARRAY",
                            nullable: true,
                            items: {
                                type: "OBJECT",
                                properties: {
                                    name: { type: "STRING" },
                                    quantity: { type: "STRING" },
                                    unit: { type: "STRING", nullable: true }
                                }
                            }
                        }
                    }
                }
            },
            error: { type: "STRING", nullable: true }
        }
    };

    let promptText;
    const commonTaskInstructions = `
- For each step, list only the ingredients *actively used or prepared* in that specific step. If a step involves only actions (e.g., 'stir', 'wait') and no new ingredients are introduced or measured, the 'ingredients' array for that step should be empty or omitted.
- Ensure start and end times (startTime, endTime) for each step are in M:SS or H:MM:SS format.
- The 'videoId' in the response should be the one extracted from the YouTube video itself if possible, otherwise use the provided videoId: ${videoId}.
- If you cannot process the video or extract a valid recipe, set the "error" field in the response.`;

    const jsonStructureReminderServings = `
Remember, the JSON output *must* strictly follow this structure (do not add extra fields, ensure all listed fields are present unless noted as nullable and not applicable). Dont add any non english characters.IT is very important that the JSON is valid.:
\\\`\\\`\\\`json
{
  "recipeTitle": "(Extracted Recipe Name or Video Title)",
  "videoId": "(Video ID, ideally from video, or use ${videoId})",
  "originalServings": "(e.g., 4 or Serves 4-6)",
  "adjustedServings": "${userServings || '(Original serving size if not adjusting)'}",
  "steps": [
    {
      "stepNumber": 1,
      "instruction": "(Step 1 instruction with any necessary ingredient quantity adjustments for ${userServings || '(original servings)'} servings...)",
      "startTime": "M:SS",
      "endTime": "M:SS",
      "ingredients": [
        { "name": "(ingredient name)", "quantity": "(adjusted quantity for ${userServings || '(original servings)'} servings)", "unit": "(unit or empty string)" }
        // ... more ingredients for this step if any ...
      ]
    }
    // ... more steps ...
  ],
  "error": "(Error message if any, otherwise null or omit)"
}
\\\`\\\`\\\`
`;

    const jsonStructureReminderNoServings = `
Remember, the JSON output *must* strictly follow this structure (do not add extra fields, ensure all listed fields are present unless noted as nullable and not applicable) Dont add any non english characters. IT is very important that the JSON is valid.:
\\\`\\\`\\\`json
{
  "recipeTitle": "(Extracted Recipe Name or Video Title)",
  "videoId": "(Video ID, ideally from video, or use ${videoId})",
  "originalServings": "(e.g., 4 or Serves 4-6)",
  "steps": [
    {
      "stepNumber": 1,
      "instruction": "(Step 1 instruction...)",
      "startTime": "M:SS",
      "endTime": "M:SS",
      "ingredients": [
        { "name": "(ingredient name)", "quantity": "(original quantity)", "unit": "(unit or empty string)" }
        // ... more ingredients for this step if any ...
      ]
    }
    // ... more steps ...
  ],
  "error": "(Error message if any, otherwise null or omit)"
}
\\\`\\\`\\\`
`;

    if (userServings) {
        promptText = `
You are a helpful assistant. Analyze the provided YouTube video and extract recipe information, adjusting it for a new serving size.

Key tasks:
- Determine the original serving size from the video. If not explicitly stated, make a reasonable assumption and note it in 'originalServings'.
- The user desires ${userServings} servings. Adjust all ingredient quantities in each step's 'ingredients' array and any quantities mentioned in the step 'instruction' text to match this new serving size. Update the 'adjustedServings' field.
${commonTaskInstructions}
${jsonStructureReminderServings}
`;
    } else {
        promptText = `
You are a helpful assistant. Analyze the provided YouTube video and extract recipe information.

Key tasks:
- Determine the original serving size from the video. If not explicitly stated, make a reasonable assumption and note it in 'originalServings'.
${commonTaskInstructions}
${jsonStructureReminderNoServings}
`;
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:generateContent?key=${apiKeyToUse}`;
    
    const requestBody = {
        contents: [{
            parts: [
                {
                    file_data: {
                        mime_type: "video/youtube",
                        file_uri: youtubeUrl
                    }
                },
                {
                    text: promptText
                }
            ]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            //responseSchema: recipeResponseSchema,
            //maxOutputTokens: 4096
        }
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorBody = await response.text(); // Use .text() for better error inspection
            console.error("API Error Status:", response.status);
            console.error("API Error Response Body:", errorBody);
            alert(`API Error: ${response.status} ${response.statusText}. Check console for details. Full error: ${errorBody}`);
            return null;
        }

        const responseData = await response.json(); // The response should already be JSON
        console.log("Parsed API Response with Schema:", responseData);
        
        let structuredResult = null;

        if (responseData.candidates && 
            responseData.candidates.length > 0 && 
            responseData.candidates[0].content && 
            responseData.candidates[0].content.parts && 
            responseData.candidates[0].content.parts.length > 0 && 
            responseData.candidates[0].content.parts[0].text &&
            typeof responseData.candidates[0].content.parts[0].text === 'string') {
            
            try {
                structuredResult = JSON.parse(responseData.candidates[0].content.parts[0].text);
            } catch (e) {
                console.error("Failed to parse JSON string from LLM part text:", responseData.candidates[0].content.parts[0].text, e);
                alert("LLM returned a malformed JSON string. Check console.");
                return null;
            }
        } else {
            // Fallback or error if the expected structure isn't found
            console.error("Unexpected response structure from LLM. Expected JSON string in candidates[0].content.parts[0].text. Response:", responseData);
            alert("Could not find structured recipe data in LLM response. Check console.");
            return null;
        }

        if (structuredResult.error) {
            alert(`Error from LLM: ${structuredResult.error}`);
            return null;
        }
        
        // Standardize to use the videoId we extracted from the input URL for consistency,
        // even though the LLM also provides one in its structuredResult.
        structuredResult.videoId = videoId; 
        return structuredResult;

    } catch (error) {
        console.error("Network or other error fetching recipe:", error);
        alert(`Network error or problem fetching recipe: ${error.message}`);
        return null;
    }
}

// Event Listener for the process URL button
const funnyLoadingMessages = [
    "Chopping onions...",
    "Preheating oven...",
    "Consulting ancient cookbooks...",
    "Whisking vigorously...",
    "Simmering gently...",
    "Finding the secret ingredient...",
    "Asking grandma for tips...",
    "Taste-testing (yum!)...",
    "Adding a pinch of magic...",
    "Plating beautifully..."
];
let funnyMessageInterval = null;
const staticLoadingInfo = " (Can take up to 30s)";

processUrlBtn.addEventListener('click', async () => {
    const url = youtubeUrlInput.value.trim();
    if (!url) {
        alert("Please enter a YouTube URL.");
        return;
    }

    // Clear previous recipe data and player if any
    recipeData = {};
    currentStepIndex = 0;
    if (player && typeof player.destroy === 'function') {
        player.destroy();
        player = null;
        // Clear the video player container explicitly
        while (videoPlayerContainer.firstChild) {
            videoPlayerContainer.removeChild(videoPlayerContainer.firstChild);
        }
    }
    stepInstructionDisplay.innerHTML = '<p>Processing... this may take a moment.</p>';
    document.getElementById('ingredientsList').innerHTML = '';
    document.getElementById('ingredientsSection').style.display = 'none';
    document.getElementById('servingsNote').textContent = '';
    updateNavigationButtons();
    // Hide progress bar initially when processing new URL
    if (stepProgressContainer) {
        stepProgressContainer.style.display = 'none';
    }
    if (stepProgressBarInner) {
        stepProgressBarInner.style.width = '0%';
    }
    if (stepProgressText) {
        stepProgressText.textContent = '';
    }

    processUrlBtn.disabled = true;
    let funnyMessageIndex = 0;
    processUrlBtn.innerHTML = `<span>${funnyLoadingMessages[funnyMessageIndex]}</span><span class="spinner"></span>`;

    if (loadingMessageBelowButton) {
        loadingMessageBelowButton.textContent = staticLoadingInfo.trim();
        loadingMessageBelowButton.style.display = 'block';
    }

    if (funnyMessageInterval) clearInterval(funnyMessageInterval);
    funnyMessageInterval = setInterval(() => {
        funnyMessageIndex = (funnyMessageIndex + 1) % funnyLoadingMessages.length;
        const textSpan = processUrlBtn.querySelector('span:not(.spinner)');
        if (textSpan) {
            textSpan.textContent = funnyLoadingMessages[funnyMessageIndex];
        } else {
            processUrlBtn.innerHTML = `<span>${funnyLoadingMessages[funnyMessageIndex]}</span><span class="spinner"></span>`;
        }
    }, 2000);

    try {
        const fetchedRecipe = await fetchRecipeFromLLM(url);
        if (fetchedRecipe && fetchedRecipe.steps && fetchedRecipe.steps.length > 0) {
            recipeData = fetchedRecipe;
            setupPlayer(recipeData.videoId);
            mainContent.classList.remove('hidden');
            header.classList.remove('centered-header');
            // Ensure the non-centered header layout is correct immediately
            //header.querySelector('.landing-text-column > h1').style.display = 'block'; // Or whatever your default is
             // The .input-area should now be hidden by CSS (display: none !important)
            // LoadStep will handle showing the progress bar for the first step
        } else {
            stepInstructionDisplay.innerHTML = '<p>Could not fetch or parse recipe. Please check the URL or try again later.</p>';
            if (fetchedRecipe && fetchedRecipe.error) {
                stepInstructionDisplay.innerHTML += `<p>Error: ${fetchedRecipe.error}</p>`;
            }
            mainContent.classList.add('hidden');
            header.classList.add('centered-header'); // Revert to landing page view
            if (stepProgressContainer) stepProgressContainer.style.display = 'none'; // Hide on error
        }
    } catch (error) {
        console.error("Error processing URL:", error);
        stepInstructionDisplay.innerHTML = '<p>An error occurred. Please try again.</p>';
        mainContent.classList.add('hidden');
        header.classList.add('centered-header'); // Revert to landing page view
        if (stepProgressContainer) stepProgressContainer.style.display = 'none'; // Hide on error
    } finally {
        // Stop funny messages
        if (funnyMessageInterval) clearInterval(funnyMessageInterval);
        processUrlBtn.disabled = false;
        processUrlBtn.textContent = "Breakdown the Recipe!";
        if (loadingMessageBelowButton) {
            loadingMessageBelowButton.textContent = '';
            loadingMessageBelowButton.style.display = 'none';
        }
    }
});

// Event Listeners for navigation
prevStepBtn.addEventListener('click', () => {
    if (currentStepIndex > 0) {
        loadStep(currentStepIndex - 1);
    }
});

nextStepBtn.addEventListener('click', () => {
    if (recipeData.steps && currentStepIndex < recipeData.steps.length - 1) {
        loadStep(currentStepIndex + 1);
    }
});

// Initial state of navigation buttons
updateNavigationButtons(); 