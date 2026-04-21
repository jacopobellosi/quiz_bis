document.addEventListener('DOMContentLoaded', () => {
    let allQuestions = [];
    let currentQuiz = [];
    let selectedAnswers = {}; // { questionId: [selectedOptions...] }
    
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

    // Start Quiz
    document.getElementById('btn-start').addEventListener('click', () => {
        if(allQuestions.length === 0) {
            alert("Le domande si stanno ancora caricando, riprova tra un secondo.");
            return;
        }
        
        // Pick 25 random weighted
        let pool = [...allQuestions];
        currentQuiz = [];
        while(currentQuiz.length < 25 && pool.length > 0) {
            let totalWeight = pool.reduce((sum, q) => sum + (q.weight || 1), 0);
            let rnd = Math.random() * totalWeight;
            let sum = 0;
            for(let i=0; i<pool.length; i++) {
                sum += (pool[i].weight || 1);
                if(rnd <= sum) {
                    currentQuiz.push(pool[i]);
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
            
            // Build options HTML
            const optionsArray = Object.entries(q.options);
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
                    <span>Domanda ${index + 1} di 25</span>
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
        document.querySelector('.progress span').innerText = `Domande da completare: ${25 - answered}`;
    }

    document.getElementById('btn-finish').addEventListener('click', () => {
        stopTimer();
        evaluateQuiz();
    });

    function evaluateQuiz() {
        let score = 0;
        const reviewContainer = document.getElementById('review-container');
        reviewContainer.innerHTML = '';
        let wrongQuestions = [];

        currentQuiz.forEach((q, index) => {
            const correctSet = new Set(q.correct_answers);
            const selectedSet = new Set(selectedAnswers[q.id] || []);
            
            // Strict check
            const isCorrect = (correctSet.size === selectedSet.size) && 
                              ([...correctSet].every(val => selectedSet.has(val)));
                              
            if(isCorrect) {
                score++;
            } else {
                wrongQuestions.push({ question: q, index, selected: [...selectedSet], correct: [...correctSet] });
            }
        });

        // Build Results Screen
        document.getElementById('score-display').innerText = `${score} / 25`;
        document.getElementById('final-time-display').innerText = formatTime(secondsElapsed);

        if(wrongQuestions.length === 0) {
            reviewContainer.innerHTML = `<p style="text-align: center; color: var(--success-color); font-weight: bold; font-size: 1.2rem;">Risultato Perfetto! Nessun Errore.</p>`;
        } else {
            wrongQuestions.forEach(item => {
                const q = item.question;
                const isSingleChoice = q.correct_answers.length === 1;
                const customBoxClass = isSingleChoice ? "custom-radio" : "custom-checkbox";
                
                // Build options list for review
                const optionsHtml = Object.entries(q.options).map(([letter, text]) => {
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
                        <span class="review-explanation-title">Spiegazione:</span>
                        <p>${q.explanation.replace(/\n/g, '<br>')}</p>
                    </div>
                ` : '';

                const cardHtml = `
                    <div class="review-card">
                        <span class="review-status">Domanda ${item.index + 1} Errata</span>
                        <div class="question-text">${q.text}</div>
                        <div class="options-grid mb-4">
                            ${optionsHtml}
                        </div>
                        ${explainHtml}
                    </div>
                `;
                reviewContainer.innerHTML += cardHtml;
            });
        }

        switchScreen('result');
    }

    document.getElementById('btn-restart').addEventListener('click', () => {
        switchScreen('start');
    });

});
