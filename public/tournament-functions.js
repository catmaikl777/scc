// Функции для турниров
window.loadTournaments = function() {
  if (window.ws && window.ws.readyState === WebSocket.OPEN) {
    window.ws.send(JSON.stringify({
      type: 'get_tournaments'
    }));
  }
};

window.joinTournament = function(tournamentId) {
  if (window.ws && window.ws.readyState === WebSocket.OPEN) {
    window.ws.send(JSON.stringify({
      type: 'join_tournament',
      tournamentId: tournamentId
    }));
  }
};

function renderTournamentsList(tournaments) {
  const tournamentsList = document.getElementById('tournamentsList');
  if (!tournaments || tournaments.length === 0) {
    tournamentsList.innerHTML = '<p>Нет активных турниров</p>';
    return;
  }
  
  tournamentsList.innerHTML = tournaments.map(tournament => `
    <div class="tournament-item">
      <div class="tournament-info">
        <div class="tournament-name">${tournament.name}</div>
        <div class="tournament-details">
          ${tournament.game_type} • ${tournament.participant_count}/${tournament.max_players} игроков • ${tournament.status}
        </div>
      </div>
      <button class="tournament-join-btn" 
              onclick="joinTournament(${tournament.id})"
              ${tournament.status !== 'waiting' ? 'disabled' : ''}>
        ${tournament.status === 'waiting' ? 'Присоединиться' : tournament.status}
      </button>
    </div>
  `).join('');
}