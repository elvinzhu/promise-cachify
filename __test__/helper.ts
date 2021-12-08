export function request(url: string, data: any) {
  return Promise.resolve({
    success: true,
    data: Math.random(),
  });
}

export function requestFixed(url: string, data: any) {
  return Promise.resolve({
    success: true,
    data: { id: 1 },
  });
}

export function errorRequest(url: string, data: any) {
  return Promise.reject({
    status: 404,
  });
}

export function falseRequest(url: string, data: any) {
  return Promise.resolve({
    success: false,
    data: null,
  });
}

export function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}
