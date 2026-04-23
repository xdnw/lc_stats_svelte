<script lang=ts>
import { appConfig as config } from "$lib/appConfig";
import { base } from "$app/paths";
import Icon from "./Icon.svelte";
</script>
<footer class="bd-footer border-top border-1 mt-3 py-4 bg-body-tertiary">
    <div class="container-md p-3 p-md-4">
        <div class="row g-4">
            <div class="col-12 col-md-4">
                <div class="d-flex align-items-center gap-2">
                    <img src="{base}/favicon-large.webp" alt="Logo" width="20" height="20">
                    <h5 class="fw-semibold m-0">{config.application}</h5>
                </div>
                <hr class="my-2">
                <ul class="list-unstyled">
                    <li class="mb-2"><a href="{config.repository_url}"><Icon name="code" className="ux-icon-leading" />Source Code</a></li>
                    <li class="mb-2"><a href="{config.wiki_url}"><Icon name="book" className="ux-icon-leading" />Wiki</a></li>
                    <li class="mb-2"><a href="https://locutus.link:8443/job/locutus/"><Icon name="cube" className="ux-icon-leading" />Jenkins</a></li>
                </ul>
            </div>
            <div class="col-12 col-md-4">
                <h5 class="fw-medium m-0">Get in Touch</h5>
                <hr class="my-2">
                <ul class="list-unstyled">
                    <li class="mb-2"><a href="https://discord.gg/{config.discord_invite}"><Icon name="chat" className="ux-icon-leading" />Discord Server</a></li>
                    <li class="mb-2"><a href="discord://discord.com/users/{config.admin_id}"><Icon name="user" className="ux-icon-leading" />Discord User</a></li>
                    <li class="mb-2"><a href="https://politicsandwar.com/nation/id={config.admin_nation}"><Icon name="gamepad" className="ux-icon-leading" />In-Game</a></li>
                    <li class="mb-2"><a href="mailto:{config.email}"><Icon name="mail" className="ux-icon-leading" />Email</a></li>
                    <li class="mb-2"><a href="{config.repository_url}/issues"><Icon name="bug" className="ux-icon-leading" />Report Issue</a></li>
                </ul>
            </div>
            <div class="col-12 col-md-4">
                <h5 class="fw-medium m-0">Legal</h5>
                <hr class="my-2">
                <ul class="list-unstyled">
                    <li class="mb-2"><a href="https://github.com/xdnw/locutus/blob/master/LICENSE"><Icon name="document" className="ux-icon-leading" />License</a></li>
                    <li class="mb-2"><a href="https://github.com/xdnw/locutus/blob/master/ToS.MD"><Icon name="checklist" className="ux-icon-leading" />Terms Of Service</a></li>
                    <li class="mb-2"><a href="https://github.com/xdnw/locutus/blob/master/PRIVACY.MD"><Icon name="shield" className="ux-icon-leading" />Privacy Policy</a></li>
                    <li class="mb-2"><a href="https://github.com/xdnw/locutus/blob/master/SECURITY.md"><Icon name="shield" className="ux-icon-leading" />Vulnerability Disclosure</a></li>
                </ul>
            </div>
        </div>
    </div>
</footer>