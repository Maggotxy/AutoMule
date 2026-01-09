class MemoryGame {
    constructor() {
        this.cards = ['🎮', '🎮', '🎨', '🎨', '🎵', '🎵', '🎪', '🎪', '🎯', '🎯', '🎲', '🎲', '🎸', '🎸', '🎺', '🎺'];
        this.flippedCards = [];
        this.matchedPairs = 0;
        this.moves = 0;
        this.timer = null;
        this.seconds = 0;
        this.isLocked = false;
        this.totalPairs = this.cards.length / 2;

        this.init();
    }

    init() {
        this.shuffleCards();
        this.renderBoard();
        this.setupEventListeners();
        this.resetStats();
    }

    shuffleCards() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    renderBoard() {
        const gameBoard = document.getElementById('gameBoard');
        gameBoard.innerHTML = '';

        this.cards.forEach((card, index) => {
            const cardElement = document.createElement('div');
            cardElement.className = 'card';
            cardElement.dataset.index = index;
            cardElement.innerHTML = `
                <div class="card-front">?</div>
                <div class="card-back">${card}</div>
            `;
            gameBoard.appendChild(cardElement);
        });
    }

    setupEventListeners() {
        const gameBoard = document.getElementById('gameBoard');
        gameBoard.addEventListener('click', (e) => this.handleCardClick(e));

        document.getElementById('restartBtn').addEventListener('click', () => this.restart());
        document.getElementById('playAgainBtn').addEventListener('click', () => this.restart());
    }

    handleCardClick(e) {
        const card = e.target.closest('.card');
        
        if (!card || this.isLocked) return;
        if (card.classList.contains('flipped') || card.classList.contains('matched')) return;

        this.flipCard(card);
        this.flippedCards.push(card);

        if (this.flippedCards.length === 2) {
            this.moves++;
            this.updateMoves();
            this.checkMatch();
        }
    }

    flipCard(card) {
        card.classList.add('flipped');
    }

    checkMatch() {
        this.isLocked = true;
        const [card1, card2] = this.flippedCards;
        const symbol1 = this.cards[card1.dataset.index];
        const symbol2 = this.cards[card2.dataset.index];

        if (symbol1 === symbol2) {
            this.handleMatch(card1, card2);
        } else {
            this.handleMismatch(card1, card2);
        }
    }

    handleMatch(card1, card2) {
        setTimeout(() => {
            card1.classList.add('matched');
            card2.classList.add('matched');
            this.matchedPairs++;
            this.updateMatches();
            this.flippedCards = [];
            this.isLocked = false;

            if (this.matchedPairs === this.totalPairs) {
                this.handleWin();
            }
        }, 500);
    }

    handleMismatch(card1, card2) {
        setTimeout(() => {
            card1.classList.remove('flipped');
            card2.classList.remove('flipped');
            this.flippedCards = [];
            this.isLocked = false;
        }, 1000);
    }

    handleWin() {
        this.stopTimer();
        const modal = document.getElementById('winModal');
        document.getElementById('finalMoves').textContent = this.moves;
        document.getElementById('finalTime').textContent = this.formatTime(this.seconds);
        modal.classList.add('show');
    }

    startTimer() {
        this.timer = setInterval(() => {
            this.seconds++;
            this.updateTimer();
        }, 1000);
    }

    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    updateTimer() {
        document.getElementById('timer').textContent = this.formatTime(this.seconds);
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    updateMoves() {
        document.getElementById('moves').textContent = this.moves;
    }

    updateMatches() {
        document.getElementById('matches').textContent = this.matchedPairs;
    }

    resetStats() {
        this.moves = 0;
        this.matchedPairs = 0;
        this.seconds = 0;
        this.flippedCards = [];
        this.isLocked = false;
        this.stopTimer();

        document.getElementById('moves').textContent = '0';
        document.getElementById('timer').textContent = '00:00';
        document.getElementById('matches').textContent = '0';
        document.getElementById('totalPairs').textContent = this.totalPairs;
        document.getElementById('winModal').classList.remove('show');
    }

    restart() {
        this.resetStats();
        this.shuffleCards();
        this.renderBoard();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MemoryGame();
});