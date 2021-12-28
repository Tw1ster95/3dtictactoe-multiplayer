const boardFields = document.querySelectorAll(".board-field");
const roomField = document.getElementById("room");

const X = '<i class="fas fa-times"></i>';
const O = '<i class="far fa-circle"></i>';

var ably, channel;
$.getJSON( "ably_key.json", function( data ) {
    ably = new Ably.Realtime(data.apikey);
    channel = ably.channels.get(data.channel);
    getRoom(channel);
});

const STATE_NONE = 0;
const STATE_WAITING = 1;
const STATE_JOINING = 2;
const STATE_PLAYING = 3;
const STATE_END = 4;

const maxRoomChecks = 5;

var gameState = STATE_NONE;

var joiningRoomID, roomChecks, roomID, myTurn, mySymbol, winner;

Array.prototype.slice.call(boardFields).forEach(function (field) {
    field.addEventListener('click', function (event) {
        if(gameState == STATE_PLAYING) {
            if(myTurn && this.innerHTML == '') {
                this.innerHTML = mySymbol;
                channel.publish(`${roomID}`, `play ` + Array.prototype.indexOf.call(boardFields, field));
            }
        }
    });
});

function getRoom(channel) {
    joiningRoomID = GET('roomid');
    if(joiningRoomID) {
        channel.subscribe(`${joiningRoomID}`, gameEvents);
        gameState = STATE_JOINING;
        roomChecks = 0;
        checkRoom();
    }
    displayRoomInfo();
}

function checkRoom() {
    if(joiningRoomID) {
        if(roomChecks < maxRoomChecks) {
            channel.publish(`${joiningRoomID}`, `check`);
            setTimeout(checkRoom, 1000);
        }
        displayRoomInfo();
        roomChecks++;
    }
}

// Player Creates Game
function createRoom() {
    roomID = getRandomID();
    if(window.history.pushState)
        window.history.pushState('page2', 'Title', `?roomid=` + roomID);
    gameState = STATE_WAITING;
    channel.subscribe(`${roomID}`, gameEvents);
    displayRoomInfo();
}

// Player Leaves Game
function leaveRoom() {
    if(window.history.pushState)
        window.history.pushState('page2', 'Title', './index.html');
    channel.unsubscribe(gameEvents);
    if(roomID) {
        channel.publish(`${roomID}`, `leave`);
        roomID = null;
    }
    gameState = STATE_NONE;
    displayRoomInfo();
}

function rematch() {
    gameState = STATE_PLAYING;
    channel.publish(`${roomID}`, `start`);
}

// Player Closes window
window.addEventListener("beforeunload", function (e) {
    channel.publish(`${roomID}`, `leave`);
});

/* window.addEventListener('mousemove', e => {
    document.documentElement.style.setProperty('--offset-Y', ((e.offsetX - (window.innerWidth/2) - 200) / 30));
    document.documentElement.style.setProperty('--offset-X', -((e.offsetY - (window.innerHeight/2) - 200) / 30));
}); */

function displayRoomInfo() {
    switch (gameState) {
        case STATE_NONE:
            roomField.innerHTML = `<button onclick="createRoom()">Create a room</button>`;
            for(var i = 0; i < boardFields.length; i++) {
                if(Math.floor(Math.random() * 2))
                    boardFields[i].innerHTML = Math.floor(Math.random() * 2) ? X : O;
                else
                    boardFields[i].innerHTML = '';
            }
            break;
        case STATE_WAITING:
            roomField.innerHTML = `<p>Waiting for an opponent to connect.</p></div>
                <p>Send this link to the second player <span>${window.location.href}</span></p>
                <button onclick="leaveRoom()">Exit room</button>`;
            break;
        case STATE_JOINING:
            if(roomChecks < maxRoomChecks)
                roomField.innerHTML = `<p>Atempting to join room ${joiningRoomID} : ${roomChecks}</p>`;
            else
                roomField.innerHTML = `<p>Failed to join room ${joiningRoomID} after ${roomChecks} attempts.</p>
                <button onclick="leaveRoom()">Back to menu</button>`;
            break;
        case STATE_PLAYING:
            roomField.innerHTML = `<p>${myTurn ? 'Your' : 'Opponent'} turn</p>
                <button onclick="leaveRoom()">Exit room</button>`;
            break;
        case STATE_END:
            if(winner)
                roomField.innerHTML = `<p>${winner} won the game!</p>
                <button onclick="rematch()">Rematch!</button>
                <button onclick="leaveRoom()">Exit room</button>`;
            else
                roomField.innerHTML = `<p>Game ended in a draw!</p>
                    <button onclick="rematch()">Rematch!</button>
                    <button onclick="leaveRoom()">Exit room</button>`;
            break;
        default:
            break;
    }
}

function gameEvents(message) {
    const args = message.data.split(' ');
    switch(args[0]) {
        case 'start':
            for(var i = 0; i < boardFields.length; i++)
                boardFields[i].innerHTML = ``;
            gameState = STATE_PLAYING;
            displayRoomInfo();
            break;
        case 'check':
            if(!joiningRoomID)
                channel.publish(`${roomID}`, `exists`);
            break;
        case 'exists':
            if(joiningRoomID) {
                roomID = joiningRoomID;
                joiningRoomID = null;
                myTurn = false;
                mySymbol = O;
            }
            else {
                myTurn = true;
                mySymbol = X;
            }
            channel.publish(`${roomID}`, `start`);
            break;
        case 'leave':
            alert('Your opponent left.');
            gameState = STATE_NONE;
            roomID = null;
            displayRoomInfo();
            break;
        case 'play':
            if(myTurn) {
                myTurn = false;
                checkWin(mySymbol);
            }
            else {
                var index = Number(args[1]);
                boardFields[index].innerHTML = (mySymbol == X ? O : X);
                myTurn = true;
            }
            displayRoomInfo();
            break;
        case 'end':
            if(args[1])
                winner = args.splice(1).join(' ');
            else
                winner = null;
            gameState = STATE_END;
            displayRoomInfo();
            break;
        default:
            break;
    }
}

function checkWin(symbol) {
    // Check rows if player won
    for(var i = 0; i < 9; i += 3) {
        if(boardFields[0+i].innerHTML == boardFields[1+i].innerHTML && boardFields[1+i].innerHTML == boardFields[2+i].innerHTML && boardFields[2+i].innerHTML !== '') {
            channel.publish(`${roomID}`, `end ` + symbol);
            return;
        }
    }
    
    // Check columns if player won
    for(var i = 0; i < 3; i++) {
        if(boardFields[0+i].innerHTML == boardFields[3+i].innerHTML && boardFields[3+i].innerHTML == boardFields[6+i].innerHTML && boardFields[6+i].innerHTML !== '') {
            channel.publish(`${roomID}`, `end ` + symbol);
            return;
        }
    }
    
    // Check diagonal if player won
    if(boardFields[0].innerHTML == boardFields[4].innerHTML && boardFields[4].innerHTML == boardFields[8].innerHTML && boardFields[8].innerHTML !== '') {
        channel.publish(`${roomID}`, `end ` + symbol);
        return;
    }
    
    // Check opposite diagonal if player won
    if(boardFields[2].innerHTML == boardFields[4].innerHTML && boardFields[4].innerHTML == boardFields[6].innerHTML && boardFields[6].innerHTML !== '') {
        channel.publish(`${roomID}`, `end ` + symbol);
        return;
    }

    for(var i = 0; i < boardFields.length; i++) {
        if(boardFields[i].innerHTML == '') 
            return;
    }

    channel.publish(`${roomID}`, `end`);
}

function getRandomID() {
    return Math.floor(Math.random() * 100000);
}

function GET(name){
    if(name=(new RegExp('[?&]'+encodeURIComponent(name)+'=([^&]*)')).exec(location.search))
       return decodeURIComponent(name[1]);
 }