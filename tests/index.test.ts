import { createSelasClient, SelasClient, StableDiffusionConfig } from "../src/index";

import * as dotenv from "dotenv";

dotenv.config();

describe("testing selas-node", () => {
  let selas: SelasClient;
  let user: string;
  let job: string;

  test("creation of client", async () => {
    selas = await createSelasClient(
      {
        app_id: process.env.TEST_APP_ID!,
        key: process.env.TEST_APP_KEY!,
        secret: process.env.TEST_APP_SECRET!,
      },
      { branch: "main" }
    );

    expect(selas).toBeDefined();

    const { data, error } = await selas.echo({ message: "Hello"});
    expect(error).toBeNull();
    expect(data).toEqual("Hello");
  });

  test("creation of users", async () => {
    const { data, error } = await selas.createAppUser();
    expect(error).toBeNull();
    if (!error) {
      user = data;
      expect(user).toBeDefined();
    }
  });

  test("token's life cycle", async () => {
    let new_token = await selas.createToken({ app_user_id: user });
    expect(new_token.error).toBeNull();
    if (!new_token.error) {
      let token = await selas.getAppUserToken({ app_user_id: user });
      if (!token.error) {
        expect(token.data).toEqual(new_token.data);
      }
    }
    let deleted = await selas.deactivateAppUser({ app_user_id: user });
    expect(deleted.error).toBeNull();
    if (!deleted.error) {
      expect(deleted.data).toEqual(true);
    }
  });

  test("creation of job", async () => {
    const config: StableDiffusionConfig = {
      steps: 28,
      skip_steps: 0,
      batch_size: 1,
      sampler: "k_euler",
      guidance_scale: 10,
      width: 512,
      height: 512,
      prompt: "banana in the kitchen",
      negative_prompt: "ugly",
      image_format: "jpeg",
      translate_prompt: false,
      nsfw_filter: false,
    };

    console.log(JSON.stringify(config));
    
    const { data, error } = await selas.postJob({
      service_id: "04cdf9c4-5338-4e32-9e63-e15b2150d7f9",
      job_config: JSON.stringify(config),
    });
    expect(error).toBeNull();
    if (!error) {
      job = String(data);
      expect(job).toBeDefined();
    }
  });

  test("Get a app user's job history", async () => {
    const { data, error } = await selas.getAppUserJobHistoryDetail({ app_user_id: user, p_limit : 10, p_offset : 0, });
    expect(error).toBeNull();
    expect(data).toBeDefined();
  });

});