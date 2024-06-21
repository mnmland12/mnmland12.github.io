const clientID = "062dbd17749049fe88a73fdade7b5bb9"; // clientID
const params = new URLSearchParams(window.location.search);
const code = params.get("code");

console.log("Initial Code:", code);

if (!code) {
    console.log("No code found, redirecting to Auth Code Flow.");
    redirectToAuthCodeFlow(clientID);
} else {
    console.log("Code found, fetching access token.");
    (async () => {
        try {
            const accessToken = await getAccessToken(clientID, code);
            console.log("Access Token:", accessToken);
            const profile = await fetchProfile(accessToken);
            console.log("Profile:", profile); // log the profile data
            populateUI(profile);

            //save access token
            localStorage.setItem("accessToken", accessToken);
            localStorage.setItem("userID", profile.id);
        } catch (error) {
            console.error("Error during token or profile fetching:", error);
        }
    })();
}

async function redirectToAuthCodeFlow(clientID) {
    // Redirect to Spotify authorization page
    const verifier = generateCodeVerifier(128);
    const challenge = await generateCodeChallenge(verifier);

    console.log("Verifier:", verifier);
    console.log("Challenge:", challenge);

    localStorage.setItem("verifier", verifier);

    const params = new URLSearchParams();
    params.append("client_id", clientID);
    params.append("response_type", "code");
    params.append("redirect_uri", "http://localhost:5173/callback");
    params.append("scope", "user-read-private user-read-email user-top-read playlist-modify-public playlist-modify-private");
    params.append("code_challenge_method", "S256");
    params.append("code_challenge", challenge);

    const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
    console.log("Auth URL:", authUrl);
    document.location = authUrl;
}

function generateCodeVerifier(length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(clientID, code) {
    // Get access token for code
    const verifier = localStorage.getItem("verifier");

    console.log("Verifier from storage:", verifier);

    const params = new URLSearchParams();
    params.append("client_id", clientID);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", "http://localhost:5173/callback");
    params.append("code_verifier", verifier);

    const result = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });

    const data = await result.json();
    console.log("Token response data:", data);

    const { access_token } = data;
    return access_token;
}

async function fetchProfile(token) {
    // Call web API
    const result = await fetch("https://api.spotify.com/v1/me", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
    });

    const profile = await result.json();
    console.log("Fetched Profile:", profile);
    return profile;
}

function populateUI(profile) {
    // Update UI with profile data
    document.getElementById("displayName").innerText = profile.display_name;
    if (profile.images[0]) {
        const profileImage = new Image(200, 200);
        profileImage.src = profile.images[0].url;
        document.getElementById("avatar").appendChild(profileImage);
        document.getElementById("imgUrl").innerText = profile.images[0].url;
    }
    document.getElementById("id").innerText = profile.id;
    document.getElementById("email").innerText = profile.email;
    document.getElementById("uri").innerText = profile.uri;
    document.getElementById("uri").setAttribute("href", profile.external_urls.spotify);
    document.getElementById("url").innerText = profile.href;
    document.getElementById("url").setAttribute("href", profile.href);
}

//add listener for top tracks button
document.getElementById("topTracksButton").addEventListener("click", async() => {
    const token = localStorage.getItem("accessToken");
    if(!token){
        console.error("No access token found.");
        return;
    }
    console.log("Access Token: ", token);
    const topTracks = await getTopTracks(token);
    displayTopTracks(topTracks);
});

async function getTopTracks(token){
    //get top tracks from last month
    const res = await fetch('https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=25', {
        headers:{Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
        method: 'GET'
    });
    const data = await res.json();
    return data.items;
}

function displayTopTracks(tracks){
    const topTracksList = document.getElementById("topTracksList");
    topTracksList.innerHTML = '';

    console.log("in display tracks");

    tracks.forEach(track => {
        const song = document.createElement("li");
        song.textContent = `${track.name} by ${track.artists.map(artist => artist.name).join(', ')}`;
        topTracksList.appendChild(song);
    });
}

//create a playlist for top songs
document.getElementById("createPlaylistButton").addEventListener("click", async () => {
    const token = localStorage.getItem("accessToken");
    const userID = localStorage.getItem("userID");
    if(!token || !userID){
        console.error("Access Token: %s or UserID: %s not valid.", token, userID);
        return;
    }
    console.log("Access Token: %s UserID: %s", token, userID);
    const topTracks = await getTopTracks(token);
    await createPlaylist(token, userID, topTracks); //need to make this method
});

async function createPlaylist(token, userID, tracks){

    //create the playlist
    const playlist = await fetch(`https://api.spotify.com/v1/users/${userID}/playlists`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: "Top 25 Tracks from Last Month",
            description: "Your favorite songs from the past month!",
            public: false
        })
    });

    if(!playlist.ok){
        console.error("Error creating playlist:", playlist.status, playlist.statusText);
        return;
    }

    const playlistData = await playlist.json();
    const playlistID = playlistData.id;
    console.log("Created Playlist with ID: ", playlistID);

    //add the tracks
    const trackURIs = tracks.map(tracks => tracks.uri);
    const addTracks = await fetch(`https://api.spotify.com/v1/playlists/${playlistID}/tracks`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            uris: trackURIs
        })
    });

    if(!addTracks.ok){
        console.error("Error adding tracks:", addTracks.status, addTracks.statusText);
        return;
    }
    console.log("Added the tracks to the playlist.");
}