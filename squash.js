// Configuration globale
const GAME_CONFIG = {
    BALL_FRICTION: 0.97,     // Augmenter la friction (était 0.985)
    MAX_POWER: 150,          // Puissance maximale de la frappe
    ANIMATION_SPEED: 0.15,   // Vitesse de base de la balle
    MAX_ARROW_LENGTH: 0.03 * 60, // 3cm * échelle (60 pixels/mètre)
    REPLAY_PAUSE: 2000,      // Pause de 2 secondes entre chaque action
    REPLAY_FRAME_DELAY: 32,  // Délai entre chaque frame pendant le replay
    BOUNCE_LOSS: 0.6,        // Perte d'énergie plus importante lors des rebonds (était 0.8)
    INITIAL_SPEED_FACTOR: 1.5 // Multiplicateur de vitesse initiale pour compenser la friction plus forte
};

class SquashSimulation {
    constructor() {
        this.canvas = document.getElementById('squashCourt');
        this.ctx = this.canvas.getContext('2d');

        // Conversion des mètres en pixels (1 mètre = 60 pixels pour l'affichage)
        this.metersToPixels = 60;
        this.courtWidth = 6.4 * this.metersToPixels;   // 6.4m de large
        this.courtHeight = 9.75 * this.metersToPixels; // 9.75m de long

        // Ajuster la taille du canvas
        this.canvas.width = this.courtWidth + 100;   // Marge de 50px de chaque côté
        this.canvas.height = this.courtHeight + 100;

        // Position et taille des joueurs
        this.players = [
            {
                x: this.courtWidth * 0.75,
                y: this.courtHeight * 0.5,
                radius: 15,
                color: 'blue',
                isDragging: false,
                hitCircle: {
                    radius: 8,
                    offset: 20, // Distance du cercle de frappe par rapport au joueur
                    color: 'lightblue'
                }
            },
            {
                x: this.courtWidth * 0.25,
                y: this.courtHeight * 0.5,
                radius: 15,
                color: 'red',
                isDragging: false,
                hitCircle: {
                    radius: 8,
                    offset: 20,
                    color: 'pink'
                }
            }
        ];

        // Position et propriétés de la balle
        this.ball = {
            x: this.courtWidth * 0.75,
            y: this.courtHeight * 0.5,
            radius: 5,
            dx: 0,
            dy: 0,
            lastHitByPlayer: 0, // 0 pour joueur bleu, 1 pour joueur rouge
            currentTrajectory: [], // Points de la trajectoire actuelle
            isAttached: true,
            attachedTo: this.players[0]
        };

        // Couleurs pour la trajectoire (une par joueur)
        this.playerColors = ['rgba(0, 0, 255, 0.5)', 'rgba(255, 0, 0, 0.5)'];

        // Ajout des propriétés pour la flèche directionnelle
        this.arrow = {
            isDrawing: false,
            startX: 0,
            startY: 0,
            endX: 0,
            endY: 0,
            player: null,
            normalizedLength: 0
        };

        // Ajouter les propriétés pour l'animation
        this.isAnimating = false;
        this.animationSpeed = GAME_CONFIG.ANIMATION_SPEED;
        this.ballVelocity = { x: 0, y: 0 };
        this.friction = GAME_CONFIG.BALL_FRICTION;
        this.maxPower = GAME_CONFIG.MAX_POWER;

        // Ajouter une propriété pour suivre la distance totale parcourue
        this.totalDistance = 0;
        this.maxDistance = this.courtHeight * 2; // Distance maximale = 2 fois la longueur du court

        // Ajouter les propriétés pour l'enregistrement
        this.sequence = {
            isRecording: false,
            actions: [], // Liste des actions (frappes et déplacements)
            currentTime: 0,
            isReplaying: false,
            initialPositions: null // Positions initiales des joueurs
        };

        // Ajouter une propriété pour l'indicateur d'enregistrement
        this.recordingIndicator = {
            color: 'red',
            radius: 10,
            blinkState: false,
            blinkInterval: null
        };

        // Ajouter un historique des trajectoires
        this.trajectoryHistory = [];

        this.setupEventListeners();

        // Initialiser l'état des boutons d'enregistrement
        const stopButton = document.getElementById('stopRecord');
        if (stopButton) {
            stopButton.disabled = true;
        }

        // Ajouter les boutons d'export/import
        const exportButton = document.getElementById('exportReplay');
        const importButton = document.getElementById('importReplay');
        const replayTextarea = document.getElementById('replayData');

        if (exportButton) {
            exportButton.addEventListener('click', () => this.exportReplay());
        }
        if (importButton) {
            importButton.addEventListener('click', () => this.importReplay());
        }

        this.draw();
    }

    setupEventListeners() {
        // Remplacer l'ancien setupEventListeners
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));

        // Ajouter les boutons pour l'enregistrement
        const startRecordButton = document.getElementById('startRecord');
        const stopRecordButton = document.getElementById('stopRecord');
        const playRecordButton = document.getElementById('playRecord');

        if (startRecordButton) {
            startRecordButton.addEventListener('click', () => this.startRecording());
        }
        if (stopRecordButton) {
            stopRecordButton.addEventListener('click', () => this.stopRecording());
        }
        if (playRecordButton) {
            playRecordButton.addEventListener('click', () => this.playRecording());
        }
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        this.players.forEach((player, index) => {
            // Calculer la position du cercle de frappe
            const hitCircleX = player.x + player.hitCircle.offset;
            const hitCircleY = player.y;

            // Vérifier si on clique sur le cercle de frappe
            const hitCircleDistance = Math.sqrt(
                Math.pow(mouseX - hitCircleX, 2) +
                Math.pow(mouseY - hitCircleY, 2)
            );

            if (hitCircleDistance < player.hitCircle.radius) {
                // Mode frappe
                this.ball.x = player.x;
                this.ball.y = player.y;
                this.ball.isAttached = true;
                this.ball.attachedTo = player;
                this.ball.lastHitByPlayer = index; // Enregistrer quel joueur frappe

                this.arrow.isDrawing = true;
                this.arrow.startX = player.x;
                this.arrow.startY = player.y;
                this.arrow.endX = mouseX;
                this.arrow.endY = mouseY;
                this.arrow.player = player;
                return;
            }

            // Vérifier si on clique sur le joueur lui-même (pour le déplacement)
            const playerDistance = Math.sqrt(
                Math.pow(mouseX - player.x, 2) +
                Math.pow(mouseY - player.y, 2)
            );

            if (playerDistance < player.radius) {
                player.isDragging = true;
            }
        });
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Mise à jour de la flèche avec limitation de longueur
        if (this.arrow.isDrawing) {
            const dx = mouseX - this.arrow.startX;
            const dy = mouseY - this.arrow.startY;
            const length = Math.sqrt(dx * dx + dy * dy);

            if (length > GAME_CONFIG.MAX_ARROW_LENGTH) {
                // Normaliser la longueur de la flèche mais garder la position de la souris pour l'affichage
                const angle = Math.atan2(dy, dx);
                this.arrow.endX = mouseX;
                this.arrow.endY = mouseY;
                // Stocker la longueur normalisée pour le calcul de la puissance
                this.arrow.normalizedLength = GAME_CONFIG.MAX_ARROW_LENGTH;
            } else {
                this.arrow.endX = mouseX;
                this.arrow.endY = mouseY;
                this.arrow.normalizedLength = length;
            }
            this.draw();
        }

        // Gestion du drag & drop des joueurs
        if (this.players.some(p => p.isDragging)) {
            this.players.forEach(player => {
                if (player.isDragging) {
                    player.x = mouseX;
                    player.y = mouseY;
                }
            });
            this.draw();
        }
    }

    handleMouseUp(e) {
        if (this.arrow.isDrawing) {
            const dx = this.arrow.endX - this.arrow.startX;
            const dy = this.arrow.endY - this.arrow.startY;
            const length = Math.sqrt(dx * dx + dy * dy);

            // Calculer la puissance proportionnellement à la longueur normalisée
            const power = (this.arrow.normalizedLength / GAME_CONFIG.MAX_ARROW_LENGTH) * this.maxPower;

            // Inverser la direction et appliquer la vélocité avec le facteur de vitesse initiale
            this.ballVelocity.x = (-dx / length) * power * this.animationSpeed * GAME_CONFIG.INITIAL_SPEED_FACTOR;
            this.ballVelocity.y = (-dy / length) * power * this.animationSpeed * GAME_CONFIG.INITIAL_SPEED_FACTOR;

            // Enregistrer la frappe
            if (this.sequence.isRecording) {
                this.recordAction('hit', {
                    playerId: this.ball.lastHitByPlayer,
                    startX: this.arrow.startX,
                    startY: this.arrow.startY,
                    velocityX: this.ballVelocity.x,
                    velocityY: this.ballVelocity.y
                });
            }

            // Sauvegarder la trajectoire précédente si elle existe
            if (this.ball.currentTrajectory.length > 0) {
                this.trajectoryHistory.push({
                    points: [...this.ball.currentTrajectory],
                    player: this.ball.lastHitByPlayer
                });
            }

            // Réinitialiser la trajectoire actuelle
            this.ball.currentTrajectory = [];

            // Réinitialiser la distance totale et la trajectoire
            this.totalDistance = 0;
            this.ball.trajectoryPoints = [];

            // Détacher la balle et démarrer l'animation
            this.ball.isAttached = false;
            this.startAnimation();
        }

        // Enregistrer la position finale du joueur après un déplacement
        this.players.forEach((player, index) => {
            if (player.isDragging) {
                this.recordAction('move', {
                    playerId: index,
                    x: player.x,
                    y: player.y
                });
            }
        });

        // Réinitialiser les états
        this.arrow.isDrawing = false;
        this.players.forEach(player => player.isDragging = false);
        this.draw();
    }

    nextStep(power, angle) {
        // Modifier la méthode pour accepter power et angle en paramètres
        const stepSize = power * 0.1;
        this.ball.x += Math.cos(angle) * stepSize;
        this.ball.y += Math.sin(angle) * stepSize;

        // Vérifier les collisions avec les murs
        if (this.ball.x <= 0 || this.ball.x >= this.courtWidth) {
            this.ball.bounceCount++;
        }
        if (this.ball.y <= 0 || this.ball.y >= this.courtHeight) {
            this.ball.bounceCount++;
        }

        // Ajouter le point à la trajectoire
        this.ball.trajectoryPoints.push({
            x: this.ball.x,
            y: this.ball.y,
            bounceCount: this.ball.bounceCount
        });

        this.draw();
    }

    draw() {
        // Effacer le canvas
        this.ctx.clearRect(0, 0, this.courtWidth + 100, this.courtHeight + 100);

        // Dessiner le terrain
        this.drawCourt();

        // Dessiner toutes les trajectoires de l'historique
        this.trajectoryHistory.forEach(trajectory => {
            let lastPoint = null;
            trajectory.points.forEach(point => {
                if (lastPoint) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(lastPoint.x, lastPoint.y);
                    this.ctx.lineTo(point.x, point.y);
                    this.ctx.strokeStyle = this.playerColors[trajectory.player];
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                }
                lastPoint = point;
            });
        });

        // Dessiner la trajectoire actuelle
        let lastPoint = null;
        this.ball.currentTrajectory.forEach(point => {
            if (lastPoint) {
                this.ctx.beginPath();
                this.ctx.moveTo(lastPoint.x, lastPoint.y);
                this.ctx.lineTo(point.x, point.y);
                this.ctx.strokeStyle = this.playerColors[this.ball.lastHitByPlayer];
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            }
            lastPoint = point;
        });

        // Dessiner les joueurs et leurs cercles de frappe
        this.players.forEach(player => {
            // Dessiner le joueur
            this.ctx.beginPath();
            this.ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = player.color;
            this.ctx.fill();

            // Dessiner le cercle de frappe
            this.ctx.beginPath();
            this.ctx.arc(
                player.x + player.hitCircle.offset,
                player.y,
                player.hitCircle.radius,
                0,
                Math.PI * 2
            );
            this.ctx.fillStyle = player.hitCircle.color;
            this.ctx.fill();
            this.ctx.strokeStyle = 'white';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Ajouter une ligne reliant le joueur au cercle de frappe
            this.ctx.beginPath();
            this.ctx.moveTo(player.x, player.y);
            this.ctx.lineTo(player.x + player.hitCircle.offset, player.y);
            this.ctx.strokeStyle = player.color;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        });

        // Dessiner la balle
        this.ctx.beginPath();
        this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = 'black';
        this.ctx.fill();

        // Ajouter le dessin de la flèche
        if (this.arrow.isDrawing) {
            // Dessiner la ligne complète pour le feedback visuel
            this.ctx.beginPath();
            this.ctx.moveTo(this.arrow.startX, this.arrow.startY);
            this.ctx.lineTo(this.arrow.endX, this.arrow.endY);

            // Dessiner la pointe de la flèche
            const angle = Math.atan2(this.arrow.endY - this.arrow.startY, this.arrow.endX - this.arrow.startX);

            this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();

            // Dessiner la pointe de la flèche
            const arrowHeadLength = 20;
            const arrowHeadAngle = Math.PI / 6;

            // Dessiner la pointe à la position de la souris
            this.ctx.beginPath();
            this.ctx.moveTo(this.arrow.endX, this.arrow.endY);
            this.ctx.lineTo(
                this.arrow.endX - arrowHeadLength * Math.cos(angle - arrowHeadAngle),
                this.arrow.endY - arrowHeadLength * Math.sin(angle - arrowHeadAngle)
            );
            this.ctx.moveTo(this.arrow.endX, this.arrow.endY);
            this.ctx.lineTo(
                this.arrow.endX - arrowHeadLength * Math.cos(angle + arrowHeadAngle),
                this.arrow.endY - arrowHeadLength * Math.sin(angle + arrowHeadAngle)
            );
            this.ctx.stroke();

            // Ajouter une indication visuelle de la puissance maximale
            if (this.arrow.normalizedLength >= GAME_CONFIG.MAX_ARROW_LENGTH) {
                this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
                this.ctx.beginPath();
                this.ctx.arc(this.arrow.startX, this.arrow.startY,
                    GAME_CONFIG.MAX_ARROW_LENGTH, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }

        // Dessiner l'indicateur d'enregistrement si actif
        if (this.sequence.isRecording) {
            this.ctx.beginPath();
            this.ctx.arc(30, 30, this.recordingIndicator.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = this.recordingIndicator.blinkState ?
                this.recordingIndicator.color : 'rgba(255, 0, 0, 0.3)';
            this.ctx.fill();
            this.ctx.fillStyle = 'white';
            this.ctx.font = '12px Arial';
            this.ctx.fillText('REC', 45, 35);
        }
    }

    drawCourt() {
        // Dessiner le fond du terrain
        this.ctx.fillStyle = '#f0f0f0';
        this.ctx.fillRect(50, 50, this.courtWidth, this.courtHeight);

        // Dessiner le contour du terrain
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(50, 50, this.courtWidth, this.courtHeight);

        // Ligne médiane (à 5.44m du mur de devant)
        const medianLineY = 50 + ((9.75 - 5.44) * this.metersToPixels);
        this.ctx.beginPath();
        this.ctx.moveTo(50, medianLineY);
        this.ctx.lineTo(this.courtWidth + 50, medianLineY);
        this.ctx.stroke();

        // Carrés de service (1.60m de côté)
        const squareSize = 1.60 * this.metersToPixels;

        // Carré gauche
        this.ctx.strokeRect(
            50, // Collé à la ligne extérieure gauche
            medianLineY,
            squareSize,
            squareSize
        );

        // Carré droit
        this.ctx.strokeRect(
            this.courtWidth + 50 - squareSize, // Collé à la ligne extérieure droite
            medianLineY,
            squareSize,
            squareSize
        );

        // Ajouter des repères visuels pour les zones de service
        this.ctx.fillStyle = 'rgba(200, 200, 200, 0.2)';
        this.ctx.fillRect(
            50,
            medianLineY,
            squareSize,
            squareSize
        );
        this.ctx.fillRect(
            this.courtWidth + 50 - squareSize,
            medianLineY,
            squareSize,
            squareSize
        );
    }

    startAnimation() {
        if (!this.isAnimating) {
            this.isAnimating = true;
            this.animate();
        }
    }

    pauseAnimation() {
        this.isAnimating = false;
    }

    resumeAnimation() {
        if (!this.isAnimating) {
            this.startAnimation();
        }
    }

    animate() {
        if (!this.isAnimating && !this.sequence.isReplaying) return;

        if (!this.ball.isAttached) {
            // Appliquer la friction
            this.ballVelocity.x *= this.friction;
            this.ballVelocity.y *= this.friction;

            // Mettre à jour la position de la balle
            this.ball.x += this.ballVelocity.x;
            this.ball.y += this.ballVelocity.y;

            // Gérer les collisions avec les murs avec plus de perte d'énergie
            if (this.ball.x <= 50) {
                this.ball.x = 50;
                this.ballVelocity.x *= -GAME_CONFIG.BOUNCE_LOSS;
                // Augmenter la friction après un rebond
                this.ballVelocity.y *= GAME_CONFIG.BOUNCE_LOSS;
            }
            if (this.ball.x >= this.courtWidth + 50) {
                this.ball.x = this.courtWidth + 50;
                this.ballVelocity.x *= -GAME_CONFIG.BOUNCE_LOSS;
                this.ballVelocity.y *= GAME_CONFIG.BOUNCE_LOSS;
            }
            if (this.ball.y <= 50) {
                this.ball.y = 50;
                this.ballVelocity.y *= -GAME_CONFIG.BOUNCE_LOSS;
                this.ballVelocity.x *= GAME_CONFIG.BOUNCE_LOSS;
            }
            if (this.ball.y >= this.courtHeight + 50) {
                this.ball.y = this.courtHeight + 50;
                this.ballVelocity.y *= -GAME_CONFIG.BOUNCE_LOSS;
                this.ballVelocity.x *= GAME_CONFIG.BOUNCE_LOSS;
            }

            // Arrêter l'animation si la balle est presque arrêtée
            if (Math.abs(this.ballVelocity.x) < 0.1 &&
                Math.abs(this.ballVelocity.y) < 0.1) {
                this.isAnimating = false;
                return;
            }

            // Ajouter le point à la trajectoire actuelle
            this.ball.currentTrajectory.push({
                x: this.ball.x,
                y: this.ball.y
            });
        }

        this.draw();
        requestAnimationFrame(() => this.animate());
    }

    startRecording() {
        this.sequence.isRecording = true;
        this.sequence.actions = [];
        this.sequence.currentTime = 0;

        // Sauvegarder les positions initiales des joueurs
        this.sequence.initialPositions = this.players.map(player => ({
            x: player.x,
            y: player.y
        }));

        // Mettre à jour les boutons
        const startButton = document.getElementById('startRecord');
        const stopButton = document.getElementById('stopRecord');
        if (startButton) startButton.disabled = true;
        if (stopButton) stopButton.disabled = false;

        // Démarrer le clignotement
        this.recordingIndicator.blinkInterval = setInterval(() => {
            this.recordingIndicator.blinkState = !this.recordingIndicator.blinkState;
            this.draw();
        }, 500);

        console.log("Début de l'enregistrement");
    }

    stopRecording() {
        this.sequence.isRecording = false;

        // Mettre à jour les boutons
        const startButton = document.getElementById('startRecord');
        const stopButton = document.getElementById('stopRecord');
        if (startButton) startButton.disabled = false;
        if (stopButton) stopButton.disabled = true;

        // Arrêter le clignotement
        if (this.recordingIndicator.blinkInterval) {
            clearInterval(this.recordingIndicator.blinkInterval);
            this.recordingIndicator.blinkInterval = null;
        }

        console.log("Fin de l'enregistrement");
        console.log(`${this.sequence.actions.length} actions enregistrées`);
        this.draw();
    }

    recordAction(type, data) {
        if (this.sequence.isRecording) {
            this.sequence.actions.push({
                time: this.sequence.currentTime,
                type: type,
                data: { ...data }
            });
        }
    }

    async playRecording() {
        if (this.sequence.actions.length === 0) return;

        // Désactiver les boutons pendant le replay
        const buttons = document.querySelectorAll('button');
        buttons.forEach(button => button.disabled = true);

        this.sequence.isReplaying = true;
        this.sequence.currentTime = 0;

        // Réinitialiser l'état du jeu
        this.ball.currentTrajectory = [];
        this.trajectoryHistory = [];

        // Restaurer les positions initiales des joueurs
        if (this.sequence.initialPositions) {
            this.players.forEach((player, index) => {
                player.x = this.sequence.initialPositions[index].x;
                player.y = this.sequence.initialPositions[index].y;
            });
        }

        // Réinitialiser la balle à la position du premier joueur
        this.ball.x = this.players[0].x;
        this.ball.y = this.players[0].y;
        this.ball.isAttached = true;
        this.ball.attachedTo = this.players[0];
        this.ballVelocity = { x: 0, y: 0 };

        // Rejouer chaque action
        for (let action of this.sequence.actions) {
            if (!this.sequence.isReplaying) break;

            // Pause avant chaque action
            await new Promise(r => setTimeout(r, GAME_CONFIG.REPLAY_PAUSE));

            if (action.type === 'move') {
                // Animation lente du déplacement du joueur
                const startX = this.players[action.data.playerId].x;
                const startY = this.players[action.data.playerId].y;
                const endX = action.data.x;
                const endY = action.data.y;

                // Animation sur 1 seconde
                const steps = 60;
                for (let i = 0; i <= steps; i++) {
                    const progress = i / steps;
                    this.players[action.data.playerId].x = startX + (endX - startX) * progress;
                    this.players[action.data.playerId].y = startY + (endY - startY) * progress;
                    this.draw();
                    await new Promise(r => setTimeout(r, 1000 / steps));
                }
            } else if (action.type === 'hit') {
                this.ball.x = action.data.startX;
                this.ball.y = action.data.startY;
                this.ball.lastHitByPlayer = action.data.playerId;
                this.ball.currentTrajectory = [];

                // Utiliser exactement la même vélocité que lors de l'enregistrement
                this.ballVelocity.x = action.data.velocityX;
                this.ballVelocity.y = action.data.velocityY;
                this.ball.isAttached = false;

                let frameCount = 0;
                const maxFrames = 300;

                await new Promise(resolve => {
                    const checkBall = () => {
                        frameCount++;

                        // Appliquer exactement la même physique que pendant l'enregistrement
                        this.ballVelocity.x *= this.friction;
                        this.ballVelocity.y *= this.friction;
                        this.ball.x += this.ballVelocity.x;
                        this.ball.y += this.ballVelocity.y;

                        // Gérer les collisions avec les murs
                        if (this.ball.x <= 50) {
                            this.ball.x = 50;
                            this.ballVelocity.x *= -GAME_CONFIG.BOUNCE_LOSS;
                            this.ballVelocity.y *= GAME_CONFIG.BOUNCE_LOSS;
                        }
                        if (this.ball.x >= this.courtWidth + 50) {
                            this.ball.x = this.courtWidth + 50;
                            this.ballVelocity.x *= -GAME_CONFIG.BOUNCE_LOSS;
                            this.ballVelocity.y *= GAME_CONFIG.BOUNCE_LOSS;
                        }
                        if (this.ball.y <= 50) {
                            this.ball.y = 50;
                            this.ballVelocity.y *= -GAME_CONFIG.BOUNCE_LOSS;
                            this.ballVelocity.x *= GAME_CONFIG.BOUNCE_LOSS;
                        }
                        if (this.ball.y >= this.courtHeight + 50) {
                            this.ball.y = this.courtHeight + 50;
                            this.ballVelocity.y *= -GAME_CONFIG.BOUNCE_LOSS;
                            this.ballVelocity.x *= GAME_CONFIG.BOUNCE_LOSS;
                        }

                        this.ball.currentTrajectory.push({
                            x: this.ball.x,
                            y: this.ball.y
                        });

                        this.draw();

                        // Utiliser les mêmes conditions d'arrêt que pendant l'enregistrement
                        if ((Math.abs(this.ballVelocity.x) < 0.1 &&
                            Math.abs(this.ballVelocity.y) < 0.1) ||
                            frameCount >= maxFrames) {
                            if (this.ball.currentTrajectory.length > 0) {
                                this.trajectoryHistory.push({
                                    points: [...this.ball.currentTrajectory],
                                    player: this.ball.lastHitByPlayer
                                });
                            }
                            resolve();
                        } else {
                            setTimeout(() => requestAnimationFrame(checkBall), GAME_CONFIG.REPLAY_FRAME_DELAY);
                        }
                    };
                    checkBall();
                });
            }
        }

        // Réactiver les boutons après le replay
        buttons.forEach(button => button.disabled = false);
        this.sequence.isReplaying = false;
    }

    exportReplay() {
        if (this.sequence.actions.length === 0) {
            alert("Aucune séquence à exporter !");
            return;
        }

        const replayData = {
            version: "1.0",
            initialPositions: this.sequence.initialPositions,
            actions: this.sequence.actions,
            courtDimensions: {
                width: this.courtWidth,
                height: this.courtHeight
            }
        };

        // Convertir en base64 pour faciliter le partage
        const base64Data = btoa(JSON.stringify(replayData));

        // Afficher dans le textarea
        const textarea = document.getElementById('replayData');
        if (textarea) {
            textarea.value = base64Data;
            textarea.select();
            try {
                document.execCommand('copy');
                alert("Replay copié dans le presse-papier !");
            } catch (err) {
                alert("Replay généré ! Vous pouvez le copier depuis la zone de texte.");
            }
        }
    }

    importReplay() {
        const textarea = document.getElementById('replayData');
        if (!textarea || !textarea.value) {
            alert("Veuillez d'abord coller un code de replay dans la zone de texte !");
            return;
        }

        try {
            // Décoder le base64 et parser le JSON
            const replayData = JSON.parse(atob(textarea.value));

            // Vérifier la version et la compatibilité
            if (!replayData.version || !replayData.actions) {
                throw new Error("Format de replay invalide");
            }

            // Charger les données
            this.sequence.initialPositions = replayData.initialPositions;
            this.sequence.actions = replayData.actions;

            alert("Replay chargé avec succès !");
            textarea.value = ''; // Nettoyer le textarea

            // Lancer automatiquement le replay
            this.playRecording();

        } catch (error) {
            alert("Erreur lors du chargement du replay : " + error.message);
        }
    }
}

// Initialiser la simulation
const simulation = new SquashSimulation(); 