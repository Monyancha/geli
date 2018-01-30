import {Request} from 'express';
import {
  Authorized, BadRequestError,
  Body,
  CurrentUser, Delete, ForbiddenError,
  Get, HttpError,
  JsonController, NotFoundError,
  Param,
  Post,
  Put,
  Req,
  UploadedFile,
  UseBefore
} from 'routing-controllers';
import passportJwtMiddleware from '../security/passportJwtMiddleware';
import * as errorCodes from '../config/errorCodes'

import {ICourse} from '../../../shared/models/ICourse';
import {IUser} from '../../../shared/models/IUser';
import {ObsCsvController} from './ObsCsvController';
import {Course, ICourseModel} from '../models/Course';
import {User} from '../models/User';
import {WhitelistUser} from '../models/WhitelistUser';
import {ICodeKataUnit} from '../../../shared/models/units/ICodeKataUnit';
import emailService from '../services/EmailService';

const multer = require('multer');
import crypto = require('crypto');

const uploadOptions = {
  storage: multer.diskStorage({
    destination: (req: any, file: any, cb: any) => {
      cb(null, 'tmp/');
    },
    filename: (req: any, file: any, cb: any) => {
      const extPos = file.originalname.lastIndexOf('.');
      const ext = (extPos !== -1) ? `.${file.originalname.substr(extPos + 1).toLowerCase()}` : '';
      crypto.pseudoRandomBytes(16, (err, raw) => {
        cb(err, err ? undefined : `${raw.toString('hex')}${ext}`);
      });
    }
  }),
};


@JsonController('/courses')
@UseBefore(passportJwtMiddleware)
export class CourseController {

  parser: ObsCsvController = new ObsCsvController();

  /**
   * @api {get} /api/courses/ Request courses of current user
   * @apiName GetCourses
   * @apiGroup Course
   *
   * @apiParam {IUser} currentUser Currently logged in user.
   *
   * @apiSuccess {Course[]} courses List of courses.
   *
   * @apiSuccessExample {json} Success-Response:
   *     [
   *         {
   *             "_id": "5a037e6b60f72236d8e7c83b",
   *             "updatedAt": "2018-01-29T20:26:35.204Z",
   *             "createdAt": "2017-11-08T22:00:11.262Z",
   *             "name": "Advanced web development",
   *             "description": "Learn all the things! Angular, Node, Express, MongoDB, TypeScript ...",
   *             "courseAdmin": {
   *                 "_id": "5a037e6a60f72236d8e7c817",
   *                 "updatedAt": "2017-11-08T22:00:10.899Z",
   *                 "createdAt": "2017-11-08T22:00:10.899Z",
   *                 "email": "teacher4@test.local",
   *                 "__v": 0,
   *                 "isActive": true,
   *                 "role": "teacher",
   *                 "profile": {
   *                     "firstName": "Severus",
   *                     "lastName": "Snap"
   *                 },
   *                 "id": "5a037e6a60f72236d8e7c817"
   *             },
   *             "active": true,
   *             "__v": 3,
   *             "whitelist": [],
   *             "enrollType": "free",
   *             "lectures": [],
   *             "students": [],
   *             "teachers": [],
   *             "hasAccessKey": false
   *         },
   *         {
   *             "_id": "5a037e6b60f72236d8e7c83d",
   *             "updatedAt": "2017-11-08T22:00:11.869Z",
   *             "createdAt": "2017-11-08T22:00:11.263Z",
   *             "name": "Introduction to web development",
   *             "description": "Whether you're just getting started with Web development or are just expanding your horizons...",
   *             "courseAdmin": {
   *                 "_id": "5a037e6a60f72236d8e7c815",
   *                 "updatedAt": "2017-11-08T22:00:10.898Z",
   *                 "createdAt": "2017-11-08T22:00:10.898Z",
   *                 "email": "teacher2@test.local",
   *                 "__v": 0,
   *                 "isActive": true,
   *                 "role": "teacher",
   *                 "profile": {
   *                     "firstName": "Ober",
   *                     "lastName": "Lehrer"
   *                 },
   *                 "id": "5a037e6a60f72236d8e7c815"
   *             },
   *             "active": true,
   *             "__v": 1,
   *             "whitelist": [],
   *             "enrollType": "free",
   *             "lectures": [],
   *             "students": [],
   *             "teachers": [],
   *             "hasAccessKey": false
   *         }
   *     ]
   */
  @Get('/')
  getCourses(@CurrentUser() currentUser: IUser) {
    const conditions = this.userReadConditions(currentUser);
    if (conditions.$or) {
      // Everyone is allowed to see free courses in overview
      conditions.$or.push({enrollType: 'free'});
      conditions.$or.push({enrollType: 'accesskey'});
    }

    const courseQuery = Course.find(conditions)
    // TODO: Do not send lectures when student has no access
      .populate('lectures')
      .populate('teachers')
      .populate('courseAdmin')
      .populate('students');

    return courseQuery
      .then(courses => courses.map(course => {
        const courseObject: any = course.toObject();

        if (currentUser.role === 'student') {
          delete courseObject.courseAdmin;

          courseObject.students = courseObject.students.filter(
            (student: any) => student._id === currentUser._id
          );
        }

        return courseObject;
      }));
  }

  /**
   * @api {get} /api/courses/:id Request course with certain ID
   * @apiName GetCourse
   * @apiGroup Course
   *
   * @apiParam {String} id Course ID.
   * @apiParam {IUser} currentUser Currently logged in user.
   *
   * @apiSuccess {Course} course Course.
   *
   * @apiSuccessExample {json} Success-Response:
   *     {
   *         "_id": "5a037e6b60f72236d8e7c83d",
   *         "updatedAt": "2017-11-08T22:00:11.869Z",
   *         "createdAt": "2017-11-08T22:00:11.263Z",
   *         "name": "Introduction to web development",
   *         "description": "Whether you're just getting started with Web development or are just expanding your horizons...",
   *         "courseAdmin": {
   *             "_id": "5a037e6a60f72236d8e7c815",
   *             "updatedAt": "2017-11-08T22:00:10.898Z",
   *             "createdAt": "2017-11-08T22:00:10.898Z",
   *             "email": "teacher2@test.local",
   *             "isActive": true,
   *             "role": "teacher",
   *             "profile": {
   *                 "firstName": "Ober",
   *                 "lastName": "Lehrer"
   *             },
   *             "id": "5a037e6a60f72236d8e7c815"
   *         },
   *         "active": true,
   *         "__v": 1,
   *         "whitelist": [],
   *         "enrollType": "free",
   *         "lectures": [],
   *         "students": [],
   *         "teachers": [],
   *         "id": "5a037e6b60f72236d8e7c83d",
   *         "hasAccessKey": false
   *     }
   *
   * @apiError NotFoundError
   */
  @Get('/:id')
  getCourse(@Param('id') id: string, @CurrentUser() currentUser: IUser) {
    return Course.findOne({
      ...this.userReadConditions(currentUser),
      _id: id
    })
    // TODO: Do not send lectures when student has no access
      .populate({
        path: 'lectures',
        populate: {
          path: 'units',
          virtuals: true,
          populate: {
            path: 'progressData',
            match: { user: { $eq: currentUser._id }}
          }
        }
      })
      .populate('courseAdmin')
      .populate('teachers')
      .populate('students')
      .populate('whitelist')
      .then((course) => {
        if (!course) {
          throw new NotFoundError();
        }

        course.lectures.forEach((lecture) => {
          lecture.units.forEach((unit) => {
            if (unit.__t === 'code-kata' && currentUser.role === 'student') {
              (<ICodeKataUnit>unit).code = null;
            }
          });
        });
        return course.toObject({virtuals: true});
      });
  }

  private userReadConditions(currentUser: IUser) {
    const conditions: any = {};

    if (currentUser.role === 'admin') {
      return conditions;
    }

    conditions.$or = [];

    if (currentUser.role === 'student') {
      conditions.active = true;
      conditions.$or.push({students: currentUser._id});
    } else {
      conditions.$or.push({teachers: currentUser._id});
      conditions.$or.push({courseAdmin: currentUser._id});
    }

    return conditions;
  }

  /**
   * @api {post} /api/courses/ Add course
   * @apiName PostCourse
   * @apiGroup Course
   * @apiPermission teacher
   * @apiPermission admin
   *
   * @apiParam {ICourse} course New course data.
   * @apiParam {Request} request Request.
   * @apiParam {IUser} currentUser Currently logged in user.
   *
   * @apiSuccess {Course} course Added course.
   *
   * @apiSuccessExample {json} Success-Response:
   *     {
   *         "_id": "5a037e6b60f72236d8e7c83d",
   *         "updatedAt": "2017-11-08T22:00:11.869Z",
   *         "createdAt": "2017-11-08T22:00:11.263Z",
   *         "name": "Introduction to web development",
   *         "description": "Whether you're just getting started with Web development or are just expanding your horizons...",
   *         "courseAdmin": {
   *             "_id": "5a037e6a60f72236d8e7c815",
   *             "updatedAt": "2017-11-08T22:00:10.898Z",
   *             "createdAt": "2017-11-08T22:00:10.898Z",
   *             "email": "teacher2@test.local",
   *             "isActive": true,
   *             "role": "teacher",
   *             "profile": {
   *                 "firstName": "Ober",
   *                 "lastName": "Lehrer"
   *             },
   *             "id": "5a037e6a60f72236d8e7c815"
   *         },
   *         "active": true,
   *         "__v": 1,
   *         "whitelist": [],
   *         "enrollType": "free",
   *         "lectures": [],
   *         "students": [],
   *         "teachers": [],
   *         "id": "5a037e6b60f72236d8e7c83d",
   *         "hasAccessKey": false
   *     }
   *
   * @apiError BadRequestError Course name already in use.
   */
  @Authorized(['teacher', 'admin'])
  @Post('/')
  addCourse(@Body() course: ICourse, @Req() request: Request, @CurrentUser() currentUser: IUser) {
    course.courseAdmin = currentUser;
    return Course.findOne({name: course.name})
      .then((existingCourse) => {
        if (existingCourse) {
          throw new BadRequestError(errorCodes.errorCodes.course.duplicateName.code);
        }
        return new Course(course).save()
          .then((c) => c.toObject());
      });
  }

  /**
   * @api {post} /api/courses/mail Send mail to selected users
   * @apiName PostCourseMail
   * @apiGroup Course
   * @apiPermission teacher
   * @apiPermission admin
   *
   * @apiParam {Object} data Mail data.
   * @apiParam {IUser} currentUser Currently logged in user.
   *
   * @apiSuccess {Todo} todo Todo.
   *
   * @apiSuccessExample {json} Success-Response:
   *     {
   *         TODO
   *     }
   */
  @Authorized(['teacher', 'admin'])
  @Post('/mail')
  sendMailToSelectedUsers(@Body() mailData: any, @CurrentUser() currentUser: IUser) {
    return emailService.sendFreeFormMail({
      ...mailData,
      replyTo: `${currentUser.profile.firstName} ${currentUser.profile.lastName}<${currentUser.email}>`,
    });
  }

  /**
   * @api {post} /api/courses/:id/enroll Enroll current student in course
   * @apiName PostCourseEnroll
   * @apiGroup Course
   * @apiPermission student
   *
   * @apiParam {String} id Course ID.
   * @apiParam {Object} data Body.
   * @apiParam {IUser} currentUser Currently logged in user.
   *
   * @apiSuccess {Course} course Enrolled course.
   *
   * @apiSuccessExample {json} Success-Response:
   *     {
   *         "_id": "5a037e6b60f72236d8e7c83d",
   *         "updatedAt": "2017-11-08T22:00:11.869Z",
   *         "createdAt": "2017-11-08T22:00:11.263Z",
   *         "name": "Introduction to web development",
   *         "description": "Whether you're just getting started with Web development or are just expanding your horizons...",
   *         "courseAdmin": {
   *             "_id": "5a037e6a60f72236d8e7c815",
   *             "updatedAt": "2017-11-08T22:00:10.898Z",
   *             "createdAt": "2017-11-08T22:00:10.898Z",
   *             "email": "teacher2@test.local",
   *             "isActive": true,
   *             "role": "teacher",
   *             "profile": {
   *                 "firstName": "Ober",
   *                 "lastName": "Lehrer"
   *             },
   *             "id": "5a037e6a60f72236d8e7c815"
   *         },
   *         "active": true,
   *         "__v": 1,
   *         "whitelist": [],
   *         "enrollType": "free",
   *         "lectures": [],
   *         "students": [],
   *         "teachers": [],
   *         "id": "5a037e6b60f72236d8e7c83d",
   *         "hasAccessKey": false
   *     }
   *
   * @apiError NotFoundError
   * @apiError ForbiddenError Not allowed to join, you are not on whitelist.
   * @apiError ForbiddenError Incorrect or missing access key.
   */
  @Authorized(['student'])
  @Post('/:id/enroll')
  enrollStudent(@Param('id') id: string, @Body() data: any, @CurrentUser() currentUser: IUser) {
    return Course.findById(id)
      .then(course => {
        if (!course) {
          throw new NotFoundError();
        }

        if (course.enrollType === 'whitelist') {
          return WhitelistUser.find(course.whitelist).then((wUsers) => {
            if (wUsers.filter(e =>
                e.firstName === currentUser.profile.firstName.toLowerCase()
                && e.lastName === currentUser.profile.lastName.toLowerCase()
                && e.uid === currentUser.uid).length <= 0) {
              throw new ForbiddenError(errorCodes.errorCodes.course.notOnWhitelist.code);
            }
          });
        } else if (course.accessKey && course.accessKey !== data.accessKey) {
          throw new ForbiddenError(errorCodes.errorCodes.course.accessKey.code);
        }

        if (course.students.indexOf(currentUser._id) < 0) {
          course.students.push(currentUser);

          return course.save().then((c) => c.toObject());
        }

        return course.toObject();
      });
  }

  /**
   * @api {post} /api/courses/:id/leave Sign out current student from course
   * @apiName PostCourseLeave
   * @apiGroup Course
   * @apiPermission student
   *
   * @apiParam {String} id Course ID.
   * @apiParam {Object} data Body.
   * @apiParam {IUser} currentUser Currently logged in user.
   *
   * @apiSuccess {Course} course Left course.
   *
   * @apiSuccessExample {json} Success-Response:
   *     {
   *         "_id": "5a037e6b60f72236d8e7c83d",
   *         "updatedAt": "2017-11-08T22:00:11.869Z",
   *         "createdAt": "2017-11-08T22:00:11.263Z",
   *         "name": "Introduction to web development",
   *         "description": "Whether you're just getting started with Web development or are just expanding your horizons...",
   *         "courseAdmin": {
   *             "_id": "5a037e6a60f72236d8e7c815",
   *             "updatedAt": "2017-11-08T22:00:10.898Z",
   *             "createdAt": "2017-11-08T22:00:10.898Z",
   *             "email": "teacher2@test.local",
   *             "isActive": true,
   *             "role": "teacher",
   *             "profile": {
   *                 "firstName": "Ober",
   *                 "lastName": "Lehrer"
   *             },
   *             "id": "5a037e6a60f72236d8e7c815"
   *         },
   *         "active": true,
   *         "__v": 1,
   *         "whitelist": [],
   *         "enrollType": "free",
   *         "lectures": [],
   *         "students": [],
   *         "teachers": [],
   *         "id": "5a037e6b60f72236d8e7c83d",
   *         "hasAccessKey": false
   *     }
   *
   * @apiError NotFoundError
   */
  @Authorized(['student'])
  @Post('/:id/leave')
  leaveStudent(@Param('id') id: string, @Body() data: any, @CurrentUser() currentUser: IUser) {
    return Course.findById(id)
      .then(course => {
        if (!course) {
          throw new NotFoundError();
        }
        const index: number = course.students.indexOf(currentUser._id);
        if (index  !== 0) {
          course.students.splice(index, 1);
          return course.save().then((c) => c.toObject());
        }

        return course.toObject();
      });
  }

  /**
   * @api {post} /api/courses/:id/whitelist Whitelist students for course
   * @apiName PostCourseWhitelist
   * @apiGroup Course
   * @apiPermission teacher
   * @apiPermission admin
   *
   * @apiParam {String} id Course ID.
   * @apiParam {Object} file Uploaded file.
   *
   * @apiSuccess {Todo} todo Todo.
   *
   * @apiSuccessExample {json} Success-Response:
   *     {
   *         Todo
   *     }
   *
   * @apiError TypeError Wrong type allowed are just csv files.
   */
  // TODO: Needs more security
  @Authorized(['teacher', 'admin'])
  @Post('/:id/whitelist')
  whitelistStudents(@Param('id') id: string, @UploadedFile('file', {options: uploadOptions}) file: any) {
    const name: string = file.originalname;
    if (!name.endsWith('.csv')) {
      throw new TypeError(errorCodes.errorCodes.upload.type.notCSV.code);
    }
    return Course.findById(id)
        .populate('whitelist')
        .populate('students')
        .then((course) => {
        return this.parser.parseFile(file).then((buffer: any) =>
          this.parser.updateCourseFromBuffer(buffer, course)
            .then(c => c.save())
            .then((c: ICourseModel) =>
            c.toObject()));
      });
  }

  /**
   * @api {put} /api/courses/:id Update course
   * @apiName PutCourse
   * @apiGroup Course
   * @apiPermission teacher
   * @apiPermission admin
   *
   * @apiParam {String} id Course ID.
   * @apiParam {ICourse} course New course data.
   * @apiParam {IUser} currentUser Currently logged in user.
   *
   * @apiSuccess {Course} course Updated course.
   *
   * @apiSuccessExample {json} Success-Response:
   *     {
   *         "_id": "5a037e6b60f72236d8e7c83d",
   *         "updatedAt": "2018-01-29T23:43:07.220Z",
   *         "createdAt": "2017-11-08T22:00:11.263Z",
   *         "name": "Introduction to web development",
   *         "description": "Whether you're just getting started with Web development or are just expanding your horizons...",
   *         "courseAdmin": "5a037e6a60f72236d8e7c815",
   *         "active": true,
   *         "__v": 1,
   *         "whitelist": [],
   *         "enrollType": "free",
   *         "lectures": [],
   *         "students": [],
   *         "teachers": [],
   *         "hasAccessKey": false
   *     }
   */
  @Authorized(['teacher', 'admin'])
  @Put('/:id')
  updateCourse(@Param('id') id: string, @Body() course: ICourse, @CurrentUser() currentUser: IUser) {
    const conditions: any = {_id: id};
    if (currentUser.role !== 'admin') {
      conditions.$or = [
        {teachers: currentUser._id},
        {courseAdmin: currentUser._id}
      ];
    }
    return Course.findOneAndUpdate(
      conditions,
      course,
      {'new': true}
    )
      .then((c) => c ? c.toObject() : undefined);
  }

  /**
   * @api {get} /api/courses/:id Delete course
   * @apiName DeleteCourse
   * @apiGroup Course
   *
   * @apiParam {String} id Course ID.
   * @apiParam {IUser} currentUser Currently logged in user.
   *
   * @apiSuccess {Boolean} result Confirmation of deletion.
   *
   * @apiSuccessExample {json} Success-Response:
   *     {
   *         "result": true
   *     }
   *
   * @apiError NotFoundError
   * @apiError ForbiddenError Forbidden!
   */
  @Authorized(['teacher', 'admin'])
  @Delete('/:id')
  async deleteCourse(@Param('id') id: string, @CurrentUser() currentUser: IUser) {
    const course = await Course.findOne( {_id : id} );
    if ( !course ) {
      throw new NotFoundError();
    }
    const courseAdmin = await User.findOne({_id: course.courseAdmin});
    if (course.teachers.indexOf(currentUser._id) !== -1 || courseAdmin.equals(currentUser._id.toString())
      || currentUser.role === 'admin' ) {
      await course.remove();
      return {result: true};
    } else {
      throw new ForbiddenError('Forbidden!');
    }
  }
}
