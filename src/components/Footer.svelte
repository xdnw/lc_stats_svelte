<script lang=ts>
import { config } from "../routes/+layout";
</script>
<footer class="bd-footer border-top border-1 mt-0 pt-3 bg-light-subtle">
    <div class="container-md">
        <div class="row g-4">
            <div class="col-4">
                <img src="favicon-large.webp" style="position:absolute;" alt="Logo" width="18" height="18">
                <h5 class="fw-medium ms-4">{config.application}</h5>
                <hr>
                <ul class="list-unstyled">
                    <li class="mb-2"><a href="{config.repository_url}"><i class="bi bi-git"></i>&nbsp;Source Code</a></li>
                    <li class="mb-2"><a href="{config.wiki_url}"><i class="bi bi-wikipedia"></i>&nbsp;Wiki</a></li>
                    <li class="mb-2"><a href="https://locutus.link:8443/job/locutus/"><i class="bi bi-box"></i>&nbsp;Jenkins</a></li>
                </ul>
            </div>
            <div class="col-4">
                <h5 class="fw-medium m-0">Get in Touch</h5>
                <hr>
                <ul class="list-unstyled">
                    <li class="mb-2"><a href="https://discord.gg/{config.discord_invite}"><i class="bi bi-discord"></i>&nbsp;Discord Server</a></li>
                    <li class="mb-2"><a href="discord://discord.com/users/{config.admin_id}"><i class="bi bi-person-circle"></i>&nbsp;Discord User</a></li>
                    <li class="mb-2"><a href="https://politicsandwar.com/nation/id={config.admin_nation}"><i class="bi bi-joystick"></i>&nbsp;In-Game</a></li>
                    <li class="mb-2"><a href="mailto:{config.email}"><i class="bi bi-at"></i>&nbsp;Email</a></li>
                    <li class="mb-2"><a href="{config.repository_url}/issues"><i class="bi bi-github"></i>&nbsp;Report Issue</a></li>
                </ul>
            </div>
            <div class="col-4">
                <h5 class="fw-medium m-0">Legal</h5>
                <hr>
                <ul class="list-unstyled">
                    <li class="mb-2"><a href="https://github.com/xdnw/locutus/blob/master/LICENSE"><i class="bi bi-list-columns-reverse"></i>&nbsp;License</a></li>
                    <li class="mb-2"><a href="https://github.com/xdnw/locutus/blob/master/ToS.MD"><i class="bi bi-list-check"></i>&nbsp;Terms Of Service</a></li>
                    <li class="mb-2"><a href="https://github.com/xdnw/locutus/blob/master/PRIVACY.MD"><i class="bi bi-list-stars"></i>&nbsp;Privacy Policy</a></li>
                    <li class="mb-2"><a href="https://github.com/xdnw/locutus/blob/master/SECURITY.md"><i class="bi bi-incognito"></i>&nbsp;Vulnerability Disclosure</a></li>
                </ul>
            </div>
        </div>
    </div>
</footer>