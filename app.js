document.addEventListener('DOMContentLoaded', () => {
    let allQuestions = [];
    let currentQuiz = [];
    let selectedAnswers = {}; // { questionId: [selectedOptions...] }
    let seenQuestionIds = new Set();
    
    let timerInterval = null;
    let secondsElapsed = 0;

    const screens = {
        start: document.getElementById('start-screen'),
        quiz: document.getElementById('quiz-screen'),
        result: document.getElementById('result-screen')
    };

    // Load data
    fetch('questions.json')
        .then(res => res.json())
        .then(data => {
            allQuestions = data;
            
            // Populate topic select
            let allSources = new Set();
            allQuestions.forEach(q => {
                if(q.source) allSources.add(q.source);
            });
            const select = document.getElementById('topic-select');
            [...allSources].sort().forEach(src => {
                let opt = document.createElement('option');
                opt.value = src;
                opt.textContent = src;
                select.appendChild(opt);
            });
        })
        .catch(err => console.error("Failed to load questions", err));

    function switchScreen(screenName) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[screenName].classList.add('active');
        window.scrollTo(0, 0);
    }

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    function startTimer() {
        secondsElapsed = 0;
        document.getElementById('time-display').innerText = "00:00";
        timerInterval = setInterval(() => {
            secondsElapsed++;
            document.getElementById('time-display').innerText = formatTime(secondsElapsed);
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    function startQuiz() {
        if(allQuestions.length === 0) {
            alert("Questions are still loading, please try again in a moment.");
            return;
        }
        
        const selectedTopic = document.getElementById('topic-select').value;
        
        let pool = allQuestions.filter(q => !seenQuestionIds.has(q.id));
        
        // Filter by topic if not ALL
        if (selectedTopic !== "ALL") {
            pool = pool.filter(q => q.source === selectedTopic);
        }
        
        if (pool.length === 0 && selectedTopic !== "ALL") {
            alert(`You have seen all questions for the topic: ${selectedTopic}. Resetting topic history.`);
            seenQuestionIds.clear();
            pool = allQuestions.filter(q => q.source === selectedTopic);
        } else if (pool.length < 25 && selectedTopic === "ALL") {
            alert("You have seen almost all questions! Resetting your history so you can keep practicing.");
            seenQuestionIds.clear();
            pool = [...allQuestions];
        } else if (pool.length === 0) {
            seenQuestionIds.clear();
            pool = [...allQuestions];
        }
        
        // Pick 25 random weighted (or all if < 25 available for a specific topic)
        let numToPick = Math.min(25, pool.length);
        currentQuiz = [];
        while(currentQuiz.length < numToPick && pool.length > 0) {
            let totalWeight = pool.reduce((sum, q) => sum + (q.weight || 1), 0);
            let rnd = Math.random() * totalWeight;
            let sum = 0;
            for(let i=0; i<pool.length; i++) {
                sum += (pool[i].weight || 1);
                if(rnd <= sum) {
                    currentQuiz.push(pool[i]);
                    seenQuestionIds.add(pool[i].id);
                    pool.splice(i, 1);
                    break;
                }
            }
        }
        
        // Reset selections
        selectedAnswers = {};
        currentQuiz.forEach(q => selectedAnswers[q.id] = []);
        
        renderQuestions();
        switchScreen('quiz');
        startTimer();
        updateProgress();
    }

    // Start New Quiz (Clearing History)
    document.getElementById('btn-start').addEventListener('click', () => {
        seenQuestionIds.clear(); // Because starting a full new simulation
        startQuiz();
    });

    document.getElementById('btn-try-again').addEventListener('click', () => {
        startQuiz();
    });

    function renderQuestions() {
        const container = document.getElementById('questions-container');
        container.innerHTML = '';
        
        currentQuiz.forEach((q, index) => {
            const card = document.createElement('div');
            card.className = 'question-card';
            
            const isSingleChoice = q.correct_answers.length === 1;
            const inputType = isSingleChoice ? "radio" : "checkbox";
            const customBoxClass = isSingleChoice ? "custom-radio" : "custom-checkbox";
            
            // Build options HTML and shuffle them
            let optionsArray = Object.entries(q.options);
            optionsArray.sort(() => Math.random() - 0.5); // Randomize options order
            
            const optionsHtml = optionsArray.map(([letter, text]) => {
                return `
                    <label class="option-label" data-qid="${q.id}" data-letter="${letter}">
                        <input type="${inputType}" name="q-${q.id}" value="${letter}">
                        <div class="${customBoxClass}"></div>
                        <div class="option-text">
                            <span class="option-letter">${letter}.</span> ${text}
                        </div>
                    </label>
                `;
            }).join('');
            
            const sourceHtml = q.source ? `<div class="question-source">Source: ${q.source}</div>` : '';
            
            card.innerHTML = `
                <div class="question-number">
                    <span>Question ${index + 1} of ${currentQuiz.length}</span>
                    ${sourceHtml}
                </div>
                <div class="question-text">${q.text}</div>
                <div class="options-grid">
                    ${optionsHtml}
                </div>
            `;
            container.appendChild(card);
        });

        // Add event listeners to checkboxes and radios
        container.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', (e) => {
                const qId = e.target.name.split('-')[1];
                const letter = e.target.value;
                const isRadio = e.target.type === 'radio';
                
                if (isRadio) {
                    selectedAnswers[qId] = [letter];
                } else {
                    if(e.target.checked) {
                        selectedAnswers[qId].push(letter);
                    } else {
                        selectedAnswers[qId] = selectedAnswers[qId].filter(l => l !== letter);
                    }
                }
                updateProgress();
            });
        });
        updateProgress();
    }

    function updateProgress() {
        let answered = 0;
        for (let qId in selectedAnswers) {
            if (selectedAnswers[qId].length > 0) {
                answered++;
            }
        }
        document.querySelector('.progress span').innerText = `Questions remaining: ${currentQuiz.length - answered}`;
    }

    document.getElementById('btn-finish').addEventListener('click', () => {
        stopTimer();
        evaluateQuiz();
    });

    function evaluateQuiz() {
        let score = 0;
        const reviewContainer = document.getElementById('review-container');
        reviewContainer.innerHTML = '';
        let reviewedQuestions = [];

        currentQuiz.forEach((q, index) => {
            const correctSet = new Set(q.correct_answers);
            const selectedSet = new Set(selectedAnswers[q.id] || []);
            
            // Strict check
            const isCorrect = (correctSet.size === selectedSet.size) && 
                              ([...correctSet].every(val => selectedSet.has(val)));
                              
            if(isCorrect) {
                score++;
            }
            
            reviewedQuestions.push({ question: q, index, selected: [...selectedSet], correct: [...correctSet], isCorrect });
        });

        // Build Results Screen
        document.getElementById('score-display').innerText = `${score} / ${currentQuiz.length}`;
        document.getElementById('final-time-display').innerText = formatTime(secondsElapsed);
        
        // Show DB progress
        const selectedTopic = document.getElementById('topic-select').value;
        let poolSizeForTopic = selectedTopic === "ALL" ? allQuestions.length : allQuestions.filter(q => q.source === selectedTopic).length;
        document.getElementById('db-progress-msg').innerText = `You have answered ${seenQuestionIds.size} total questions across your session. Great job!`;

        reviewedQuestions.forEach(item => {
            const q = item.question;
            const isSingleChoice = q.correct_answers.length === 1;
            const customBoxClass = isSingleChoice ? "custom-radio" : "custom-checkbox";
            
            // Build options list for review (maintaining original A-Z order here for clarity in review!)
            const optionsArrayOriginal = Object.entries(q.options);
            const optionsHtml = optionsArrayOriginal.map(([letter, text]) => {
                let className = "option-label";
                const isSelected = item.selected.includes(letter);
                const isActuallyCorrect = item.correct.includes(letter);
                
                if (isActuallyCorrect && isSelected) className += " correct";     // Rightly picked
                else if (!isActuallyCorrect && isSelected) className += " wrong"; // Wrongly picked
                else if (isActuallyCorrect && !isSelected) className += " missed"; // Missed to pick
                
                let innerMarking = '';
                if (isSelected && !isSingleChoice) innerMarking = '<div style="width:6px;height:12px;border:solid white;border-width:0 2px 2px 0;transform:rotate(45deg);margin-bottom:2px;"></div>';
                if (isSelected && isSingleChoice) innerMarking = '<div style="width:10px;height:10px;background:white;border-radius:50%;"></div>';
                
                return `
                    <div class="${className}" style="pointer-events: none;">
                        <div class="${customBoxClass}" style="${isSelected ? 'background: var(--accent-color); border-color: var(--accent-color);' : ''}">
                            ${innerMarking}
                        </div>
                        <div class="option-text">
                            <span class="option-letter">${letter}.</span> ${text}
                        </div>
                    </div>
                `;
            }).join('');

            const explainHtml = q.explanation ? `
                <div class="review-explanation">
                    <span class="review-explanation-title">Explanation:</span>
                    <p>${q.explanation.replace(/\n/g, '<br>')}</p>
                </div>
            ` : '';

            const statusClass = item.isCorrect ? "review-status correct-status" : "review-status";
            const statusText = item.isCorrect ? `Question ${item.index + 1} Correct!` : `Question ${item.index + 1} Incorrect`;

            const cardHtml = `
                <div class="review-card">
                    <span class="${statusClass}">${statusText}</span>
                    <div class="question-text">${q.text}</div>
                    <div class="options-grid mb-4">
                        ${optionsHtml}
                    </div>
                    ${explainHtml}
                </div>
            `;
            reviewContainer.innerHTML += cardHtml;
        });

        switchScreen('result');
    }

    document.getElementById('btn-restart').addEventListener('click', () => {
        seenQuestionIds.clear();
        switchScreen('start');
    });

});
