/** Load configuration before modules that derive constants from the environment. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
