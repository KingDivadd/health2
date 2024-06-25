import { Request, Response, NextFunction } from 'express'
import redisFunc from '../helpers/redisFunc';
import { CustomRequest } from '../helpers/interface';
import { videosdk_api_key, videosdk_secret_key, videosdk_endpoint } from '../helpers/constants';
import axios from 'axios';
import {io} from '../index'
import prisma from '../helpers/prisma'
const jwt = require('jsonwebtoken')


class VideoChat {

            
        userJoinedWebHook =  (req: Request, res: Response, next: NextFunction) => {
            const data = req.body;
            console.log('User joined:', data);
            // Handle user joined event
            res.status(200).send('Webhook received',);
        };

        sessionStartedWebHook =  (req: Request, res: Response, next: NextFunction) => {
            const data = req.body;
            console.log('Session started:', data);
            // Handle session started event
            res.status(200).send('Webhook received');
        };

        userLeftWebHook =  (req: Request, res: Response, next: NextFunction) => {
            const data = req.body;
            console.log('User left:', data);
            // Handle user left event
            res.status(200).send('Webhook received');
        };

        sessionEndedWebHook =  (req: Request, res: Response, next: NextFunction) => {
            const data = req.body;
            console.log('Session ended:', data);
            // Handle session ended event
            res.status(200).send('Webhook received');
        };

    
    generateToken = (req: CustomRequest, res: Response, next: NextFunction)=>{
        const {appointment_id} = req.body
        try {
            if (!appointment_id || appointment_id.trim() == ""){
                return res.status(400).json({err: 'Please provide the appointment id'})
            }

            const options = { expiresIn: "23h", algorithm: "HS256" };
        
            const payload = {
                appointment_id,
                apikey: videosdk_api_key,
                permissions: ["allow_join", "allow_mod"],
            };
        
            const token = jwt.sign(payload, videosdk_secret_key, options);
            res.json({ token });
        } catch (err:any) {
            console.log('Error occured while generating video sdk token. error: ',err)
            return res.status(500).json({err: 'Error occured while generating video sdk token. error: ',error: err})
        }
    }
    
    createMeeting = async(req: CustomRequest, res: Response, next: NextFunction)=>{
        const {appointment_id} = req.body
        try{
            const token = req.headers['authorization']
            if (!token || token === "") {
                return res.status(400).json({ err: 'Please provide a valid token' });
            }

            if (!appointment_id || appointment_id.trim() == ""){
                return res.status(400).json({err: 'Please provide the appointment id'})
            }

            const appointment = await prisma.appointment.findUnique({where: {appointment_id}})

            if (!appointment){return res.status(404).json({err: 'Appointemnt not found'})}

            const user = req.account_holder.user

            let patient_id = user.patient_id || '';
            let physician_id = user.physician_id || '';
    
            let call_receiver = patient_id ? appointment.physician_id : (physician_id ? appointment.patient_id : null);
            let caller = patient_id ? patient_id : (physician_id ? physician_id : null)

            let callerInfo = patient_id ? user : (physician_id ? user : null)
            
    
            if (call_receiver == null) {
                return res.status(400).json({ err: 'Unable to determine the call receiver.' });
            }

            
            const response = await axios.post(`${videosdk_endpoint}/v2/rooms`, {userMeetingId: appointment_id},
                {
                    headers: {
                        Authorization: token,
                    },
                }
            );

        
        // now add a socket connection

        const meetingId = response.data.roomId
        
        io.emit(`video-call-${call_receiver}`, {
            statusCode: 200,
            meeting_id: meetingId,
            caller_id: caller,
            receiver_id: call_receiver,
            caller_info: callerInfo
        })

        return res.status(200).json(response.data);

        }catch (err:any) {
            if (err.response) {
                console.error('Error response from API:', err.response.data);
                return res.status(err.response.status).json({
                    err: 'Error occurred while creating meeting: ', error: err.response.data
                });
            } else if (err.request) {
                console.error('No response received from API:', err.request);
                return res.status(500).json({
                    err: 'No response received from API while creating meeting.', error: err.request
                });
            } else {
                console.error('Error creating meeting:', err.message);
                return res.status(500).json({
                    err: 'Error occurred while creating meeting.', error: err.message
                });
            }
        }
    }

    validateMeeting = async(req: CustomRequest, res: Response, next: NextFunction)=>{
        const token = req.headers['authorization']
        try{
            if (!token || token === "") {
                return res.status(400).json({ err: 'Please provide a valid token' });
            }

            const meetingId = req.params.meetingId;
            if (!meetingId){
                return res.status(400).json({err: 'Invalid meeting id'})
            }

            const response = await axios.get(`${videosdk_endpoint}/v2/rooms/${meetingId}`,
                {
                    headers: {
                        Authorization: token,
                    },
                }
            );
    
            return res.status(200).json(response.data);

        }catch (err:any) {
            if (err.response) {
                console.error('Error response from API:', err.response.data);
                return res.status(err.response.status).json({
                    err: 'Error occurred while validating meeting: ', error: err.response.data
                });
            } else if (err.request) {
                console.error('No response received from API:', err.request);
                return res.status(500).json({
                    err: 'No response received from API while validating meeting.', error: err.request
                });
            } else {
                console.error('Error validating meeting:', err.message);
                return res.status(500).json({
                    err: 'Error occurred while vaidating meeting.', error: err.message
                });
            }
        }
    }
    
    listMeeting = async (req: CustomRequest, res: Response, next: NextFunction) => {
        const token = req.headers['authorization']
    
        try {
            if (!token || token === "") {
                return res.status(400).json({ err: 'Please provide a valid token' });
            }

            const {page_number} = req.params
            const per_page = 15
            
            const response = await axios.get(
                `${videosdk_endpoint}/v2/rooms?page=${page_number}&perPage=${per_page}`,
                {
                    headers: {
                        Authorization: token,
                        'Content-Type': 'application/json',
                    }
                }
            );
    
            return res.status(200).json(response.data);
        } catch (err: any) {
            if (err.response) {
                console.error('Error response from API:', err.response.data);
                return res.status(err.response.status).json({
                    err: 'Error occurred while listing meetings: ', error: err.response.data
                });
            } else if (err.request) {
                console.error('No response received from API:', err.request);
                return res.status(500).json({
                    err: 'No response received from API while listing meetings.', error: err.request
                });
            } else {
                console.error('Error listing meetings:', err.message);
                return res.status(500).json({
                    err: 'Error occurred while listing meetings.', error: err.message
                });
            }
        }
    };

    listSelectedMeeting = async (req: CustomRequest, res: Response, next: NextFunction) => {
        const token = req.headers['authorization']
    
        try {
            if (!token || token === "") {
                return res.status(400).json({ err: 'Please provide a valid token' });
            }
            
            const {roomId} = req.params;
            if (!roomId){
                return res.status(400).json({err: 'Invalid meeting id'})
            }

            const response = await axios.get(
                `${videosdk_endpoint}/v2/rooms/${roomId}`,
                {
                    headers: {
                        Authorization: token,
                    },
                }
            );
    
            return res.status(200).json(response.data);
        } catch (err: any) {
            if (err.response) {
                console.error('Error response from API:', err.response.data);
                return res.status(err.response.status).json({
                    err: 'Error occurred while fetching selected meeting: ', error: err.response.data
                });
            } else if (err.request) {
                console.error('No response received from API:', err.request);
                return res.status(500).json({
                    err: 'No response received from API while fetching selected meeting.', error: err.request
                });
            } else {
                console.error('Error fetching selected meeting:', err.message);
                return res.status(500).json({
                    err: 'Error occurred while fetching selected meeting.', error: err.message
                });
            }
        }
    };

    deActivateMeeting = async (req: Request, res: Response, next: NextFunction) => {
        const token = req.headers['authorization']
    
        try {
            if (!token || token === "") {
                return res.status(400).json({ err: 'Please provide a valid token' });
            }
            const {roomId} = req.params
            if (!roomId || roomId === "") {
                return res.status(400).json({ err: 'Please provide a valid room ID' });
            }
        
            const response = await axios.post(
                'https://api.videosdk.live/v2/rooms/deactivate', { roomId },
                {
                    headers: {
                        'Authorization': token,
                        'Content-Type': 'application/json',
                    }
                }
            );
    
            console.log('Deactivation response: ', response.data);
    
            return res.status(200).json(response.data);
        } catch (err:any) {
    
            if (err.response) {
                
                console.error('Error response from API:', err.response.data);
                return res.status(err.response.status).json({
                    err: 'Error occurred while deactivating the meeting. error: ',
                    error: err.response.data
                });
            } else if (err.request) {
                console.error('No response received from API:', err.request);
                return res.status(500).json({
                    err: 'No response received from API while deactivating the meeting.',
                    error: err.request
                });
            } else {
                console.error('Error deactivating selected meeting:', err.message);
                return res.status(500).json({
                    err: 'Error occurred while deactivating selected meeting.',
                    error: err.message
                });
            }
        }
    };


    listMeetingSession = async (req: CustomRequest, res: Response, next: NextFunction) => {
        const token = req.headers['authorization']
    
        try {
            if (!token || token === "") {
                return res.status(400).json({ err: 'Please provide a valid token' });
            }
            
            const per_page = 15
            const {roomId, page_number} = req.params;
            if (!roomId){
                return res.status(400).json({err: 'Invalid meeting id'})
            }


            const response = await axios.get(
                `${videosdk_endpoint}/v2/sessions/?roomId=${roomId}&page=${page_number}&perPage=${per_page}`,
                {
                    headers: {
                        Authorization: token,
                    },
                }
            );
    
            return res.status(200).json(response.data);
        } catch (err: any) {
            if (err.response) {
                console.error('Error response from API:', err.response.data);
                return res.status(err.response.status).json({
                    err: 'Error occurred while listing meeting sessions: ', error: err.response.data
                });
            } else if (err.request) {
                console.error('No response received from API:', err.request);
                return res.status(500).json({
                    err: 'No response received from API while listing meeting sessions.', error: err.request
                });
            } else {
                console.error('Error listing meeting sessions:', err.message);
                return res.status(500).json({
                    err: 'Error occurred while listing meeting sessions.', error: err.message
                });
            }
        }
    };

    getSessionDetails = async (req: CustomRequest, res: Response, next: NextFunction) => {
        const token = req.headers['authorization']
    
        try {
            if (!token || token === "") {
                return res.status(400).json({ err: 'Please provide a valid token' });
            }
            
            const {sessionId} = req.params;

            const response = await axios.get(
                `${videosdk_endpoint}/v2/sessions/${sessionId}`,
                {
                    headers: {
                        Authorization: token,
                    },
                }
            );
    
            return res.status(200).json(response.data);
        } catch (err: any) {
            if (err.response) {
                console.error('Error response from API:', err.response.data);
                return res.status(err.response.status).json({
                    err: 'Error occurred while fetching session details: ', error: err.response.data
                });
            } else if (err.request) {
                console.error('No response received from API:', err.request);
                return res.status(500).json({
                    err: 'No response received from API while fetching session details.', error: err.request
                });
            } else {
                console.error('Error fetching session details:', err.message);
                return res.status(500).json({
                    err: 'Error occurred while fetching session details.', error: err.message
                });
            }
        }
    };

    fetchParticipant = async (req: CustomRequest, res: Response, next: NextFunction) => {
        const token = req.headers['authorization']
    
        try {
            if (!token || token === "") {
                return res.status(400).json({ err: 'Please provide a valid token' });
            }
            const per_page = 15
            
            const {sessionId} = req.params;

            const response = await axios.get(
                `${videosdk_endpoint}/v2/sessions/${sessionId}/participants?page=1&perPage=${per_page}`,
                {
                    headers: {
                        Authorization: token,
                    },
                }
            );
    
            return res.status(200).json(response.data);
        } catch (err: any) {
            if (err.response) {
                console.error('Error response from API:', err.response.data);
                return res.status(err.response.status).json({
                    err: 'Error occurred while fetching participant: ', error: err.response.data
                });
            } else if (err.request) {
                console.error('No response received from API:', err.request);
                return res.status(500).json({
                    err: 'No response received from API while fetching active participant.', error: err.request
                });
            } else {
                console.error('Error fetching participant:', err.message);
                return res.status(500).json({
                    err: 'Error occurred while fetching participant.', error: err.message
                });
            }
        }
    };

    fetchActiveParticipant = async (req: CustomRequest, res: Response, next: NextFunction) => {
        const token = req.headers['authorization']
    
        try {
            if (!token || token === "") {
                return res.status(400).json({ err: 'Please provide a valid token' });
            }
            const per_page = 15
            
            const {sessionId} = req.params;

            const response = await axios.get(
                `${videosdk_endpoint}/v2/sessions/${sessionId}/participants/active?page=1&perPage=${per_page}`,
                {
                    headers: {
                        Authorization: token,
                    },
                }
            );
    
            return res.status(200).json(response.data);
        } catch (err: any) {
            if (err.response) {
                console.error('Error response from API:', err.response.data);
                return res.status(err.response.status).json({
                    err: 'Error occurred while fetching active participant: ', error: err.response.data
                });
            } else if (err.request) {
                console.error('No response received from API:', err.request);
                return res.status(500).json({
                    err: 'No response received from API while fetching active participant.', error: err.request
                });
            } else {
                console.error('Error fetching active participant:', err.message);
                return res.status(500).json({
                    err: 'Error occurred while fetching active participant.', error: err.message
                });
            }
        }
    };

    endMeetingSession = async (req: CustomRequest, res: Response, next: NextFunction) => {
        const token = req.headers['authorization']
        const {roomId, sessionId} = req.body
    
        try {
            if (!token || token === "") {
                return res.status(400).json({ err: 'Please provide a valid token' });
            }
    
            const response = await axios.post(
                `${videosdk_endpoint}/v2/sessions/end`, {roomId, sessionId},
                {
                    headers: {
                        Authorization: token,
                        "Content-Type": "application/json"
                    },
                }
            );
    
            return res.status(200).json(response.data);
        } catch (err: any) {
            if (err.response) {
                console.error('Error response from API:', err.response.data);
                return res.status(err.response.status).json({
                    err: 'Error occurred while ending meeting session: ', error: err.response.data
                });
            } else if (err.request) {
                console.error('No response received from API:', err.request);
                return res.status(500).json({
                    err: 'No response received from API while ending meeting session.', error: err.request
                });
            } else {
                console.error('Error ending meeting session:', err.message);
                return res.status(500).json({
                    err: 'Error occurred while ending meeting session.', error: err.message
                })
            }
        }
    };

    removeParticipant = async (req: CustomRequest, res: Response, next: NextFunction) => {
        const token = req.headers['authorization']
        const {particiapantId, roomId, sessionId} = req.body
    
        try {
            if (!token || token === "") {
                return res.status(400).json({ err: 'Please provide a valid token' });
            }

            const response = await axios.post(
                `${videosdk_endpoint}/v2/sessions/participants/remove`, {particiapantId, roomId, sessionId},
                {
                    headers: {
                        Authorization: token,
                    },
                }
            );
    
            return res.status(200).json(response.data);
        } catch (err: any) {
            if (err.response) {
                console.error('Error response from API:', err.response.data);
                return res.status(err.response.status).json({
                    err: 'Error occurred while removing selected participant: ', error: err.response.data
                });
            } else if (err.request) {
                console.error('No response received from API:', err.request);
                return res.status(500).json({
                    err: 'No response received from API while removing selected participant.', error: err.request
                });
            } else {
                console.error('Error removing selected participant:', err.message);
                return res.status(500).json({
                    err: 'Error occurred while removing selected participant.', error: err.message
                });
            }
        }
    };

    

}
export default new VideoChat