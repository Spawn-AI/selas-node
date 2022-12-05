import { createClient, SupabaseClient } from "@supabase/supabase-js";
var Pusher = require('pusher-client');

export type Customer = {
  id?: string;
  external_id: string;
  user_id: string;
  credits: number;
};

export type Token = {
  id?: string;
  key: string;
  created_at?: string;
  user_id: string;
  ttl: number;
  quota: number;
  customer_id: string;
  description?: string;
};

export type WorkerFilter = {
  id?: string;
  name?: string;
  branch?: string;
  is_dirty?: boolean;
  cluster?: number;
};

export type StableDiffusionConfig = {
  steps: number;
  skip_steps: number;
  batch_size: 1 | 2 | 4 | 8 | 16;
  sampler: "plms" | "ddim" | "k_lms" | "k_euler" | "k_euler_a";
  guidance_scale: number;
  width: 384 | 448 | 512 | 575 | 768 | 640 | 704 | 768;
  height: 384 | 448 | 512 | 575 | 768 | 640 | 704 | 768;
  prompt: string;
  negative_prompt: string;
  init_image?: string;
  mask?: string;
  image_format: "png" | "jpeg" | "avif" | "webp";
  translate_prompt: boolean;
  nsfw_filter: boolean;
  seed?: number;
};

/**
 * SelasClient is a client for the Selas API.
 *
 * @param supabase - Supabase client
 * @param app_id - The application ID.
 * @param key - The application key.
 * @param secret - The application secret.
 * @param worker_filter - Filter with regex to select workers.
 */
export class SelasClient {
  supabase: SupabaseClient;
  app_id: string;
  key: string;
  secret: string;
  worker_filter: WorkerFilter;

  constructor(supabase: SupabaseClient, app_id: string, key: string, secret: string, worker_filter?: WorkerFilter) {
    this.supabase = supabase;
    this.app_id = app_id;
    this.key = key;
    this.secret = secret;
    this.worker_filter = worker_filter || { branch: "prod" };
  }

  /**
   * Call a rpc function on the selas server with app_id, key and secret.
   *
   * @param fn
   * @param params
   * @returns data from the rpc function or an error.
   */
  rpc = async (fn: string, params: any) => {
    const paramsWithSecret = { ...params, p_secret: this.secret, p_app_id: this.app_id, p_key: this.key };
    const { data, error } = await this.supabase.rpc(fn, paramsWithSecret);

    return { data, error };
  };

  echo = async () => {
    return await this.rpc("app_owner_echo", {});
  };

  getAppSuperUser = async () => {
    const { data, error } = await this.rpc("app_owner_get_super_user", {});
    if (!error) {
      return { data: String(data), error };
    } else {
      return { data, error };
    }
  };

  getAppUserToken = async (args: { app_user_id: string }) => {
    const { data, error } = await this.rpc("app_owner_get_user_token_value", { p_app_user_id: args.app_user_id });
    if (!error) {
      return { data: String(data), error };
    } else {
      return { data, error };
    }
  };

  /**
   * Add customer to the database. After creation, the customer will have 0 credits ;
   *  credits can be added with the addCredits method. The customer will be able to
   * use the API with the token created with the createToken method.
   *
   * @param id - the id of the customer you want to retrieve
   * @returns the customer object {id: string, credits: number} or an error message
   *
   * @example
   * Start by creating a customer called "Leopold" then add 10 credits to him and create a token that you can send to him.
   * ```ts
   * const {data: customer} = await selas.createCustomer("leopold");
   * const {data: credits} = await selas.changeCredits("leopold", 10);
   * const {data: token} = await selas.createToken("leopold");
   * ```
   */
  createAppUser = async () => {
    const { data, error } = await this.rpc("app_owner_create_user", {});
    if (!error) {
      return { data: String(data), error };
    } else {
      return { data, error };
    }
  };

  /**
   * Get information about a customer. The customer must have been created with the createCustomer method.
   *
   * @param id - the id of the customer you want to check
   * @returns the current number of credits of the customer or an error message
   *
   * @example
   * You can check the number of credits of a customer by calling the getCustomer method.
   * ```ts
   * const {data: credits} = await selas.getCustomerCredits("leopold");
   * console.log(`Leopold has ${credits} credits left.`); // Leopold had 25 credits left.
   * ```
   *
   */
  getAppUserCredits = async (args: { app_user_id: string }) => {
    const { data, error } = await this.rpc("app_owner_get_user_credits", { p_app_user_id: args.app_user_id });
    return { data, error };
  };

  /**
   * Delete a customer from Selas API. The remaining credits will be recredited back to your account.
   *
   * @param id - the id of the customer you want to delete
   * @returns the remaining number of credits if successful or an error message
   *
   * @example
   * You can check the number of credits of a customer by calling the getCustomer method.
   * ```ts
   * const {data: credits} = await selas.deleteCustomer("leopold");
   * console.log(`Leopold had ${credits} credits left before being deleted.`);  // Leopold had 25 credits left before being deleted.
   * ```
   *
   */
  deactivateAppUser = async (args: { app_user_id: string }) => {
    var token = await this.rpc("app_owner_get_token", { p_app_user_id: args.app_user_id });
    var deleted = await this.rpc("app_owner_revoke_user_token", {
      p_app_user_id: args.app_user_id,
      p_token: token.data,
    });
    return deleted;
  };

  postJob = async (args: { service_id: string; job_config: string }) => {
    const { data, error } = await this.rpc("app_owner_post_job_admin", {
      p_service_id: args.service_id,
      p_job_config: args.job_config,
      p_worker_filter: this.worker_filter,
    });
    return { data, error };
  };

  subscribeToJob = (args: { job_id: string; callback: (result: object) => void }) => {
    const client = new Pusher("ed00ed3037c02a5fd912", {
      cluster: "eu",
    });

    const channel = client.subscribe(`job-${args.job_id}`);
    channel.bind("result", args.callback);
  };

  /**
   * Change the current credits of a customer. The customer must have been created with the createCustomer method. The credits can be negative,
   * in which case the custome will lose credits and the remaining credits will be
   *  recredited back to your account. A customer can't have negative credits.
   *
   * @param args.delta - the number of credits to add or remove from the customer
   * @param args.id - the id of the customer you want to delete
   * @returns the remaining number of credits if successful or an error message
   *
   * @example
   * You can modify the number of credits of a customer.
   * ```ts
   * const {data: credits} = await selas.getCustomerCredits("leopold");
   * console.log(`Leopold has ${credits} credits left.`); // Leopold has 25 credits left.
   * const {data: credits} = await selas.changeCredits("leopold", 10);
   * console.log(`Leopold has ${credits} credits now.`); // Leopold has 35 credits now.
   * ```
   *
   */
  addCredit = async (args: { app_user_id: string; amount: number }) => {
    const { data, error } = await this.rpc("app_owner_add_user_credits", {
      p_amount: args.amount,
      p_app_user_id: args.app_user_id,
    });
    return { data, error };
  };

  /**
   * Create a token for a customer. The customer must have been created with the createCustomer method, and have at least 1 credit.
   * The token can be used to access the API from the Client of @selas/selas-js package.
   *
   * @param args.id - the id of the customer who will use the token
   * @param args.quota - the maximum number of credits the customer can spend using the token. It will not be
   * possible to use the token if the customer has less credits than the quota.
   * @param args.ttl - the time to live of the token in seconds. After this time, the token will be invalid.
   * @param args.description - a description of the token. It will be used to identify the token in the dashboard.
   * @returns the token containing a key attribute if successful or an error message
   *
   * @example
   * Create a token for a customer.
   * ```ts
   * const {data: credits} = await selas.getCustomerCredits("leopold");
   * console.log(`The token key is ${token.key}.`); // The token key is $a6IvYd6h12@.
   * ```
   *
   */
  async createToken(args: { app_user_id: string }) {
    const { data, error } = await this.rpc("app_owner_create_user_token", { p_app_user_id: args.app_user_id });

    if (error) {
      return { data, error };
    } else {
      return { data: String(data), error };
    }
  }

  /**
   * Run a StableDiffusion job on Selas API. The job will be run on the first available worker.
   *
   * @param args.prompt - the description of the image to be generated
   * @param args.negative_prompt - description of the image to be generated, but with negative words like "ugly", "blurry" or "low quality"
   * @param args.width - the width of the generated image
   * @param args.height - the height of the generated image
   * @param args.steps - the number of steps of the StableDiffusion algorithm. The higher the number, the more detailed the image will be. Generally, 30 steps is enough, but you can try more if you want.
   * @param args.batch_size - the number of images to be generated at each step.
   * @param args.guidance_scale - the weight of the guidance image in the loss function. Typical values are between 5. and 15. The higher the number, the more the image will look like the prompt. If you go too high, the image will look like the prompt but will be low quality.
   * @param args.init_image - the url of an initial image to be used by the algorithm. If not provided, random noise will be used. You can start from an existing image and make StableDiffusion refine it. You can specify the skip_steps to choose how much of the image will be refined (0 is like a random initialization, 1. is like a copy of the image).
   * @param args.mask - the url of a mask image. The mask image must be a black and white image where white pixels are the pixels that will be modified by the algorithm. Black pixels will be kept as they are. If not provided, the whole image will be modified.
   * @param args.skip_steps - the number of steps to skip at the beginning of the algorithm. If you provide an init_image, you can choose how much of the image will be refined. 0 is like a random initialization, 1. is like a copy of the image.
   * @param args.seed - the seed of the random number generator. Using twice the same we generate the same image. It can be useful to see the effect of parameters on the image generated. If not provided, a random seed will be used.
   * @param args.image_format - the format of the generated image. It can be "png" or "jpeg".
   * @param args.nsfw_filter - if true, the image will be filtered to remove NSFW content. It can be useful if you want to generate images for a public website.
   * @param args.translate_prompt - if true, the prompt will be translated to English before being used by the algorithm. It can be useful if you want to generate images in a language that is not English.
   **/
  runStableDiffusion = async (args: StableDiffusionConfig) => {
    const response = await this.postJob({
      service_id: "04cdf9c4-5338-4e32-9e63-e15b2150d7f9",
      job_config: JSON.stringify(args),
    });

    if (response.error) {
      return { data: null, error: response.error };
    } else {
      return { data: response.data, error: null };
    }
  };
}

/**
 * Create a selas client. The client can be used to access the API using the credentials created
 * on https://selas.ai. The client can be used to manage users, tokens and credits of an app. Be careful, the client
 * is not secure and should not be used in a browser.
 *
 * @param credentials - the credentials of the app. You can create them on https://selas.ai
 *
 * @returns a SelasClient object.
 *
 * @example
 * Create a app owner client.
 * ```ts
 * const selas = await createCLient({app_id: "9a8b7c6d5e4f3g2h1i0j", app_key: "e9t#ah9-t", app_secret: "a9t#ah9-t"});
 * ```
 *
 */
export const createSelasClient = async (
  credentials: { app_id: string; key: string; secret: string },
  worker_filter?: WorkerFilter
) => {
  const SUPABASE_URL = "https://lgwrsefyncubvpholtmh.supabase.co";
  const SUPABASE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxnd3JzZWZ5bmN1YnZwaG9sdG1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE2Njk0MDE0MzYsImV4cCI6MTk4NDk3NzQzNn0.o-QO3JKyJ5E-XzWRPC9WdWHY8WjzEFRRnDRSflLzHsc";

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  return new SelasClient(supabase, credentials.app_id, credentials.key, credentials.secret, worker_filter);
};
